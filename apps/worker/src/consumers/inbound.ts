// Processamento de mensagem inbound normalizada (doc 05 §5): resolve
// (empresaId, tipo, valor) → Cliente via IdentidadeCanal (nasce provisório se
// não existe), acha/cria a Conversa aberta do par (canal, identidade) e grava
// a Mensagem — dedup pelo unique (empresaId, canalId, idExterno): a reentrega
// morre em silêncio. Bloco 3: sem motores — conversa nova nasce em
// fila_humano; árvore/IA chegam no Bloco 4.

import type { MensagemInboundNormalizada } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";

import { enfileirarTurnoIA } from "../ia/enfileirar.js";

// Tabela canônica identidade externa → TipoIdentidade (doc 02 §4)
const TIPO_IDENTIDADE: Record<string, "whatsapp" | "instagram" | "messenger" | "telegram" | "email" | "webchat"> = {
  telefone: "whatsapp",
  instagram_id: "instagram",
  messenger_id: "messenger",
  telegram_id: "telegram",
  email: "email",
  webchat_visitor: "webchat",
};

export async function processarInbound(m: MensagemInboundNormalizada): Promise<void> {
  await runWithTenant({ empresaId: m.empresaId }, async () => {
    // 1. identidade → cliente (cria provisório na primeira mensagem)
    const tipo = TIPO_IDENTIDADE[m.identidadeExterna.tipo] ?? "whatsapp";
    let identidade = await prisma.identidadeCanal.findUnique({
      where: {
        empresaId_tipo_valor: {
          empresaId: m.empresaId,
          tipo,
          valor: m.identidadeExterna.valor,
        },
      },
    });
    if (!identidade) {
      const cliente = await prisma.cliente.create({
        data: {
          nome: m.identidadeExterna.valor, // sem cadastro ainda — o painel renomeia
          telefone: tipo === "whatsapp" ? m.identidadeExterna.valor : undefined,
          provisorio: true,
        } as never,
      });
      identidade = await prisma.identidadeCanal.create({
        data: { clienteId: cliente.id, tipo, valor: m.identidadeExterna.valor } as never,
      });
    }

    // 2. conversa aberta do par (canal, identidade) — ou nova
    let conversa = await prisma.conversa.findFirst({
      where: {
        canalId: m.canalId,
        identidadeCanalId: identidade.id,
        estado: { not: "encerrada" },
        deletedAt: null,
      },
      orderBy: { criadoEm: "desc" },
    });
    if (!conversa) {
      // Quem atende primeiro: o agente do canal, se houver um publicado.
      // A checagem é da VERSÃO publicada, não só do vínculo — um agente criado
      // e nunca publicado não tem persona no ar, e a conversa nasceria em
      // `bot_ia` para um turno que sempre falharia por falta de contexto.
      const estadoInicial = (await canalTemAgentePublicado(m.canalId))
        ? ("bot_ia" as const)
        : ("fila_humano" as const);

      conversa = await prisma.conversa.create({
        data: {
          canalId: m.canalId,
          clienteId: identidade.clienteId,
          identidadeCanalId: identidade.id,
          estado: estadoInicial,
        } as never,
      });
    }

    // 3. mensagem — dedup: reentrega morre no unique (P2002), silenciosamente
    try {
      const criada = await prisma.mensagem.create({
        data: {
          canalId: m.canalId,
          conversaId: conversa.id,
          direcao: "entrada",
          tipo: m.tipo,
          origemMotor: "cliente",
          texto: m.texto,
          idExterno: m.idExterno,
          respostaA: m.respostaA,
          statusEntrega: "entregue",
          criadoEm: m.timestamp,
        } as never,
      });
      // toque na conversa p/ ordenação da fila (updatedAt)
      await prisma.conversa.update({ where: { id: conversa.id }, data: { estado: conversa.estado } });

      // 4. turno de IA — SÓ no ramo de sucesso.
      //
      // Enfileirar no `catch` de dedupe faria toda reentrega do provedor gerar
      // um segundo turno: o WhatsApp reentrega com frequência, turno custa
      // dinheiro, e o cliente receberia a mesma resposta duas vezes.
      if (conversa.estado === "bot_ia" && m.texto) {
        await enfileirarTurnoIA({
          empresaId: m.empresaId,
          conversaId: conversa.id,
          mensagemId: criada.id,
        }).catch((e) => {
          // Fila indisponível não pode derrubar o inbound: a mensagem já está
          // gravada e visível na inbox, e um humano ainda pode responder.
          console.error("[inbound] falha ao enfileirar turno de IA:", e);
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/unique|P2002/i.test(msg)) throw e; // dedup é esperado; o resto não
    }
  });
}

/**
 * O canal tem agente com versão PUBLICADA?
 *
 * Roda no mesmo contexto de tenant do inbound. Devolve `false` em qualquer
 * dúvida: sem agente publicado, a conversa nasce em `fila_humano` e um humano
 * atende — o pior desfecho aqui é dar trabalho a alguém, não deixar o cliente
 * falando sozinho com um bot que não existe.
 */
async function canalTemAgentePublicado(canalId: string): Promise<boolean> {
  const canal = await prisma.canal.findUnique({
    where: { id: canalId },
    select: { agentePadraoId: true },
  });
  if (!canal?.agentePadraoId) return false;

  const agente = await prisma.agenteIA.findFirst({
    where: { id: canal.agentePadraoId, ativo: true, deletedAt: null },
    select: { versaoAtivaId: true },
  });
  return Boolean(agente?.versaoAtivaId);
}
