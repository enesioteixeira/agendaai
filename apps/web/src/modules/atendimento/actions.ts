"use server";

// Server Actions do atendimento (Bloco 3.4). Padrão: sessão → escopo (matriz
// doc 02 §13) → Zod → runWithTenant → revalidatePath. O envio NÃO fala com o
// worker: grava a Mensagem `pendente` (outbox) e o worker entrega.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { temEscopo, crypto as cryptoCore, type SessaoPayload } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { lerSessao } from "@/lib/sessao";

const { cifrarSegredo } = cryptoCore;

export interface EstadoAtendimento {
  erro?: string;
  ok?: boolean;
}

async function exigir(escopo: string): Promise<SessaoPayload> {
  const sessao = await lerSessao();
  if (!sessao) throw new Error("Sessão expirada — entre novamente.");
  if (!temEscopo(sessao, escopo)) throw new Error(`Seu papel não tem o escopo ${escopo}.`);
  return sessao;
}

function contexto(s: SessaoPayload) {
  return { empresaId: s.empresaId, usuarioId: s.usuarioId };
}

function comoEstado(fn: () => Promise<void>): Promise<EstadoAtendimento> {
  return fn()
    .then(() => ({ ok: true }) as EstadoAtendimento)
    .catch((e) => ({ erro: e instanceof Error ? e.message : "Erro inesperado." }));
}

// ── Conversas ────────────────────────────────────────────────

/**
 * Assumir, devolver e reabrir devolvem ESTADO em vez de lançar.
 *
 * Perder a corrida do claim é caminho **normal**: dois atendentes olhando a
 * mesma fila e clicando quase junto é o dia a dia de um time de atendimento.
 * Enquanto isso era `throw`, o segundo atendente via a tela de erro do Next —
 * um evento cotidiano sendo tratado como falha de sistema.
 */
export async function assumirConversaAction(
  _prev: EstadoAtendimento,
  formData: FormData,
): Promise<EstadoAtendimento> {
  return comoEstado(async () => {
    const sessao = await exigir("atendimento:assumir");
    const conversaId = String(formData.get("id") ?? "");
    await runWithTenant(contexto(sessao), async () => {
      // claim atômico: só assume se ainda está na fila (anti-corrida entre atendentes)
      const claim = await prisma.conversa.updateMany({
        where: { id: conversaId, estado: "fila_humano" },
        data: { estado: "humano", atendenteUsuarioId: sessao.usuarioId },
      });
      if (claim.count === 0) throw new Error("Conversa já foi assumida por outra pessoa.");
    });
    revalidatePath("/inbox");
    revalidatePath(`/inbox/${conversaId}`);
  });
}

export async function encerrarConversaAction(formData: FormData): Promise<void> {
  const sessao = await exigir("atendimento:responder");
  const conversaId = String(formData.get("id") ?? "");
  await runWithTenant(contexto(sessao), async () => {
    await prisma.conversa.update({
      where: { id: conversaId },
      data: { estado: "encerrada", encerradaEm: new Date() },
    });
  });
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${conversaId}`);
}

/**
 * Devolve à fila: o atendente larga a conversa e ela volta a ficar disponível
 * para quem estiver livre.
 *
 * NÃO é "devolver ao bot". Enquanto o motor de IA não existe (Fase C), devolver
 * para `bot_ia` deixaria a conversa sem ninguém — nem humano, nem máquina —, e o
 * cliente ficaria falando sozinho. A transição para os estados de bot entra
 * junto com o motor que sabe atendê-los.
 *
 * O claim é condicionado a `estado: "humano"`: se a conversa já mudou (outro
 * atendente, encerramento), o `updateMany` casa zero linhas e a ação recusa em
 * vez de sobrescrever o que aconteceu no meio.
 */
export async function devolverConversaAction(
  _prev: EstadoAtendimento,
  formData: FormData,
): Promise<EstadoAtendimento> {
  return comoEstado(async () => {
    const sessao = await exigir("atendimento:responder");
    const conversaId = String(formData.get("id") ?? "");
    await runWithTenant(contexto(sessao), async () => {
      const devolvida = await prisma.conversa.updateMany({
        where: { id: conversaId, estado: "humano" },
        data: { estado: "fila_humano", atendenteUsuarioId: null },
      });
      if (devolvida.count === 0) throw new Error("Esta conversa não está em atendimento.");
    });
    revalidatePath("/inbox");
    revalidatePath(`/inbox/${conversaId}`);
  });
}

/**
 * Reabre uma conversa encerrada, devolvendo-a à fila. O cliente que escreve de
 * novo depois do encerramento cria uma conversa nova pelo worker; isto aqui é
 * para o outro caso — encerrar por engano, ou perceber que faltou resolver algo.
 */
export async function reabrirConversaAction(
  _prev: EstadoAtendimento,
  formData: FormData,
): Promise<EstadoAtendimento> {
  return comoEstado(async () => {
    const sessao = await exigir("atendimento:responder");
    const conversaId = String(formData.get("id") ?? "");
    await runWithTenant(contexto(sessao), async () => {
      const reaberta = await prisma.conversa.updateMany({
        where: { id: conversaId, estado: "encerrada" },
        data: { estado: "fila_humano", encerradaEm: null, atendenteUsuarioId: null },
      });
      if (reaberta.count === 0) throw new Error("Esta conversa não está encerrada.");
    });
    revalidatePath("/inbox");
    revalidatePath(`/inbox/${conversaId}`);
  });
}

const responderSchema = z.object({
  conversaId: z.string().min(1),
  texto: z.string().min(1).max(4000),
});

export async function responderConversaAction(
  _prev: EstadoAtendimento,
  formData: FormData,
): Promise<EstadoAtendimento> {
  return comoEstado(async () => {
    const sessao = await exigir("atendimento:responder");
    const parsed = responderSchema.safeParse({
      conversaId: formData.get("conversaId"),
      texto: formData.get("texto"),
    });
    if (!parsed.success) throw new Error("Mensagem vazia ou longa demais.");

    await runWithTenant(contexto(sessao), async () => {
      const conversa = await prisma.conversa.findUnique({
        where: { id: parsed.data.conversaId },
      });
      if (!conversa || conversa.deletedAt) throw new Error("Conversa não encontrada.");
      if (conversa.estado === "encerrada") throw new Error("Conversa encerrada.");

      // OUTBOX: a mensagem nasce `pendente`; o worker envia e atualiza o status.
      // Se a conversa ainda está na fila, responder também a assume.
      await prisma.$transaction([
        prisma.mensagem.create({
          data: {
            canalId: conversa.canalId,
            conversaId: conversa.id,
            direcao: "saida",
            origemMotor: "humano",
            texto: parsed.data.texto,
            autorUsuarioId: sessao.usuarioId,
            statusEntrega: "pendente",
          } as never,
        }),
        prisma.conversa.update({
          where: { id: conversa.id },
          data:
            conversa.estado === "fila_humano"
              ? { estado: "humano", atendenteUsuarioId: sessao.usuarioId }
              : { estado: conversa.estado }, // toque p/ atualizadoEm
        }),
      ]);
    });
    revalidatePath("/inbox");
    revalidatePath(`/inbox/${parsed.data.conversaId}`);
  });
}

// ── Canais (config:canais) ───────────────────────────────────

const canalSchema = z.object({
  nome: z.string().min(2).max(80),
});

export async function canalCriarAction(
  _prev: EstadoAtendimento,
  formData: FormData,
): Promise<EstadoAtendimento> {
  return comoEstado(async () => {
    const sessao = await exigir("config:canais");
    const parsed = canalSchema.safeParse({ nome: formData.get("nome") });
    if (!parsed.success) throw new Error("Nome inválido (2–80 caracteres).");
    await runWithTenant(contexto(sessao), async () => {
      await prisma.canal.create({
        data: {
          tipo: "whatsapp_baileys",
          nome: parsed.data.nome,
          statusConexao: "desconectado",
          // placeholder cifrado: o worker troca pelo QR ao abrir o socket
          configCifrada: cifrarSegredo(JSON.stringify({})),
        } as never,
      });
    });
    revalidatePath("/configuracoes/canais");
  });
}

export async function canalRemoverAction(formData: FormData): Promise<void> {
  const sessao = await exigir("config:canais");
  const canalId = String(formData.get("id") ?? "");
  await runWithTenant(contexto(sessao), async () => {
    // desativar (não deletar): conversas/mensagens históricas apontam p/ ele.
    // O gestor de sockets derruba a conexão na próxima reconciliação (≤15s)
    // e o logout limpa o auth-state.
    await prisma.$transaction([
      prisma.canal.update({ where: { id: canalId }, data: { ativo: false, statusConexao: "desconectado" } }),
      prisma.authStateBaileys.deleteMany({ where: { canalId } }),
    ]);
  });
  revalidatePath("/configuracoes/canais");
}
