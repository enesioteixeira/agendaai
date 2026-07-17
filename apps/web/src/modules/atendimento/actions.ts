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

export async function assumirConversaAction(formData: FormData): Promise<void> {
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
  revalidatePath("/atendimento");
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
  revalidatePath("/atendimento");
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
    revalidatePath(`/atendimento/${parsed.data.conversaId}`);
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
