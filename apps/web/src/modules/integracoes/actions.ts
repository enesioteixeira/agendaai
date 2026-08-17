"use server";

// Server Actions das integrações de retaguarda (Fase G).
//
// ⚠️ CREDENCIAL NUNCA VOLTA PARA A TELA. Ela é cifrada na entrada (regra 15) e
// as leituras devolvem só o estado da conexão. O formulário de edição vem
// vazio: campo em branco significa "manter a atual", nunca "apagar" — padrão
// herdado do ev-tracker, onde a tela jamais relê um segredo.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { crypto as cryptoCore, temEscopo, type SessaoPayload } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";

import { lerSessao } from "@/lib/sessao";

const { cifrarSegredo } = cryptoCore;

export interface EstadoIntegracao {
  erro?: string;
  ok?: boolean;
}

const ESCOPO = "config:empresa";

async function exigir(): Promise<SessaoPayload> {
  const sessao = await lerSessao();
  if (!sessao) throw new Error("Sessão expirada — entre novamente.");
  if (!temEscopo(sessao, ESCOPO)) throw new Error(`Seu papel não tem o escopo ${ESCOPO}.`);
  return sessao;
}

const conectarSchema = z.object({
  categoria: z.enum(["erp", "crm", "pagamento"]),
  tipo: z.string().min(2).max(40),
  nome: z.string().min(2).max(60),
  baseUrl: z.string().max(200).optional(),
  apiKey: z.string().min(8).max(400),
});

export async function conectarIntegracaoAction(
  _prev: EstadoIntegracao,
  formData: FormData,
): Promise<EstadoIntegracao> {
  try {
    const sessao = await exigir();
    const p = conectarSchema.safeParse({
      categoria: formData.get("categoria"),
      tipo: formData.get("tipo"),
      nome: formData.get("nome"),
      baseUrl: formData.get("baseUrl") || undefined,
      apiKey: formData.get("apiKey"),
    });
    if (!p.success) throw new Error("Preencha nome, tipo e a chave de API (mínimo 8 caracteres).");

    // As credenciais viajam juntas num único blob cifrado: são sempre lidas em
    // conjunto pelo driver, e separá-las em colunas multiplicaria os pontos que
    // precisam lembrar de cifrar.
    const credenciais = cifrarSegredo(
      JSON.stringify({ apiKey: p.data.apiKey, baseUrl: p.data.baseUrl ?? null }),
    );

    await runWithTenant({ empresaId: sessao.empresaId, usuarioId: sessao.usuarioId }, async () => {
      const existente = await prisma.integracaoExterna.findFirst({
        where: { categoria: p.data.categoria, tipo: p.data.tipo },
      });

      if (existente) {
        await prisma.integracaoExterna.update({
          where: { id: existente.id },
          data: {
            nome: p.data.nome,
            credenciaisCifradas: credenciais,
            status: "conectada",
            ultimoErro: null,
          },
        });
        return;
      }

      await prisma.integracaoExterna.create({
        data: {
          categoria: p.data.categoria,
          tipo: p.data.tipo,
          nome: p.data.nome,
          credenciaisCifradas: credenciais,
        } as never,
      });
    });

    revalidatePath("/integracoes");
    return { ok: true };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Erro inesperado." };
  }
}

export async function removerIntegracaoAction(formData: FormData): Promise<void> {
  const sessao = await exigir();
  const id = String(formData.get("id") ?? "");
  await runWithTenant({ empresaId: sessao.empresaId, usuarioId: sessao.usuarioId }, async () => {
    // Apaga de verdade: diferente de canal, integração não é referenciada por
    // histórico de conversa. O que sobrevive é o MapeamentoEntidade, que some
    // junto por cascade lógico ao recriar.
    await prisma.mapeamentoEntidade.deleteMany({ where: { integracaoId: id } });
    await prisma.integracaoExterna.delete({ where: { id } });
  });
  revalidatePath("/integracoes");
}

export async function pausarIntegracaoAction(formData: FormData): Promise<void> {
  const sessao = await exigir();
  const id = String(formData.get("id") ?? "");
  const pausar = formData.get("pausar") === "1";
  await runWithTenant({ empresaId: sessao.empresaId, usuarioId: sessao.usuarioId }, async () => {
    await prisma.integracaoExterna.update({
      where: { id },
      data: { status: pausar ? "pausada" : "conectada" },
    });
  });
  revalidatePath("/integracoes");
}
