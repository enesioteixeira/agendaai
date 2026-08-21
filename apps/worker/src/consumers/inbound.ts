// Processamento de mensagem inbound normalizada (doc 05 §5): resolve
// (empresaId, tipo, valor) → Cliente via IdentidadeCanal (nasce provisório se
// não existe), acha/cria a Conversa aberta do par (canal, identidade) e grava
// a Mensagem — dedup pelo unique (empresaId, canalId, idExterno): a reentrega
// morre em silêncio. Bloco 3: sem motores — conversa nova nasce em
// fila_humano; árvore/IA chegam no Bloco 4.

import type { ResultadoDeMidia } from "@atende/canais";
import { chaveDeMidia, type MensagemInboundNormalizada } from "@atende/core";
import { prisma, rotearConversa, runWithTenant } from "@atende/db";

import { enfileirarTurnoIA } from "../ia/enfileirar.js";
import { armazenamentoDeMidia } from "../midia/armazenamento.js";

/**
 * Como o painel busca o arquivo depois.
 *
 * Sem base pública configurada — o caso correto para mídia de conversa —, a
 * leitura sai pela rota do próprio produto e a validade não é usada: quem
 * autoriza é a sessão, a cada requisição, e não um link que expira sozinho.
 */
const VALIDADE_DE_LEITURA_SEGUNDOS = 3600;

// Tabela canônica identidade externa → TipoIdentidade (doc 02 §4)
const TIPO_IDENTIDADE: Record<string, "whatsapp" | "instagram" | "messenger" | "telegram" | "email" | "webchat"> = {
  telefone: "whatsapp",
  instagram_id: "instagram",
  messenger_id: "messenger",
  telegram_id: "telegram",
  email: "email",
  webchat_visitor: "webchat",
};

/**
 * `obterMidia` é preguiçoso de propósito.
 *
 * O WhatsApp reentrega com frequência, e baixar o arquivo antes de saber se a
 * mensagem é nova gastaria rede e memória em toda reentrega — a mesma razão
 * pela qual o turno de IA só é enfileirado no ramo de sucesso. Aqui a função só
 * é chamada depois de o `create` passar pelo unique de dedupe.
 */
export async function processarInbound(
  m: MensagemInboundNormalizada,
  obterMidia?: () => Promise<ResultadoDeMidia>,
): Promise<void> {
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

      // Fila, dono e prazo — só para conversa NOVA.
      //
      // É aqui que a operação de atendimento começa a existir: sem esta
      // chamada, filas e prazos ficam configurados no painel e nenhuma
      // conversa entra neles, o que é pior que não ter a funcionalidade —
      // o gerente configura o prazo de 15 minutos do televendas e o número
      // nunca sai do zero.
      //
      // Falha aqui NÃO derruba a mensagem: a conversa sem fila continua
      // visível na inbox e alguém assume. Perder a mensagem do cliente por
      // causa de roteamento seria trocar um problema de organização por um
      // de negócio.
      try {
        await rotearConversa(conversa.id, m.timestamp);
      } catch (e) {
        console.error(`[inbound] roteamento falhou na conversa ${conversa.id}:`, e);
      }
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

      // 4. mídia — também só no ramo de sucesso, e depois do create porque a
      // chave do arquivo carrega o id da mensagem. Falha aqui não derruba nada:
      // a conversa já está na inbox e o operador responde sem o anexo.
      if (obterMidia) {
        await guardarMidia(m.empresaId, conversa.id, criada.id, obterMidia).catch((e) =>
          console.error(`[inbound] mídia falhou (mensagem ${criada.id}):`, e),
        );
      }

      // 5. turno de IA — SÓ no ramo de sucesso.
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

/**
 * Baixa, guarda e aponta a mídia da mensagem.
 *
 * Roda dentro do contexto de tenant do inbound. A chave vem de `chaveDeMidia`,
 * nunca montada aqui — é ela que garante o tenant no prefixo do bucket, e
 * política de acesso por prefixo só funciona se o prefixo for o tenant.
 */
async function guardarMidia(
  empresaId: string,
  conversaId: string,
  mensagemId: string,
  obterMidia: () => Promise<ResultadoDeMidia>,
): Promise<void> {
  const armazenamento = armazenamentoDeMidia();
  if (!armazenamento) return;

  const resultado = await obterMidia();
  if (!resultado.ok) {
    console.warn(`[inbound] mídia não guardada (mensagem ${mensagemId}): ${resultado.motivo}`);
    return;
  }

  const chave = chaveDeMidia(empresaId, conversaId, mensagemId);
  const guardado = await armazenamento.guardar(chave, {
    conteudo: resultado.conteudo,
    tipoMime: resultado.tipoMime,
    nomeOriginal: resultado.nomeOriginal,
  });
  const url = await armazenamento.urlDeLeitura(chave, VALIDADE_DE_LEITURA_SEGUNDOS);

  await prisma.mensagem.update({
    where: { id: mensagemId },
    data: {
      ponteiroR2: chave,
      midia: [
        {
          url,
          mimeType: guardado.tipoMime,
          tamanhoBytes: guardado.tamanhoBytes,
          ...(resultado.nomeOriginal ? { nomeArquivo: resultado.nomeOriginal } : {}),
        },
      ],
    },
  });
}
