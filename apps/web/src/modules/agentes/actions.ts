"use server";

// Server Actions do estúdio de agentes (Fase D).
// Padrão do repo: sessão → escopo → Zod → runWithTenant → revalidatePath.
//
// A regra que governa este módulo: PUBLICAR É CONGELAR. Editar um agente que
// está atendendo trocaria a persona no meio da frase, então o que se edita é
// sempre um RASCUNHO; publicar cria a versão que as conversas novas vão usar.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { crypto as cryptoCore, temEscopo, type SessaoPayload } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";

import { lerSessao } from "@/lib/sessao";

const { cifrarSegredo } = cryptoCore;

export interface EstadoAgente {
  erro?: string;
  ok?: boolean;
}

// `config:canais` guarda esta tela porque criar agente é configurar como o
// atendimento automático se comporta — mesma família de decisão de conectar um
// canal, e evita inventar escopo novo antes de haver demanda por separá-los.
const ESCOPO = "config:canais";

async function exigir(): Promise<SessaoPayload> {
  const sessao = await lerSessao();
  if (!sessao) throw new Error("Sessão expirada — entre novamente.");
  if (!temEscopo(sessao, ESCOPO)) throw new Error(`Seu papel não tem o escopo ${ESCOPO}.`);
  return sessao;
}

function comoEstado(fn: () => Promise<void>): Promise<EstadoAgente> {
  return fn()
    .then(() => ({ ok: true }) as EstadoAgente)
    .catch((e) => ({ erro: e instanceof Error ? e.message : "Erro inesperado." }));
}

const criarSchema = z.object({
  nome: z.string().min(2).max(60),
  persona: z.string().min(20).max(8000),
});

/**
 * Cria o agente já com a versão 1 em rascunho.
 *
 * Nascer sem versão nenhuma deixaria a tela com um agente que não dá para
 * editar nem publicar — estado morto que o usuário teria de resolver clicando
 * em "criar versão", um passo que não significa nada para ele.
 */
export async function criarAgenteAction(
  _prev: EstadoAgente,
  formData: FormData,
): Promise<EstadoAgente> {
  return comoEstado(async () => {
    const sessao = await exigir();
    const p = criarSchema.safeParse({
      nome: formData.get("nome"),
      persona: formData.get("persona"),
    });
    if (!p.success) {
      throw new Error("Nome de 2 a 60 caracteres e persona de pelo menos 20.");
    }

    await runWithTenant({ empresaId: sessao.empresaId, usuarioId: sessao.usuarioId }, async () => {
      const agente = await prisma.agenteIA.create({
        data: { nome: p.data.nome } as never,
      });
      await prisma.versaoAgente.create({
        data: {
          agenteId: agente.id,
          numero: 1,
          status: "rascunho",
          persona: p.data.persona,
          provedor: "anthropic",
        } as never,
      });
    });
    revalidatePath("/agentes");
  });
}

const editarSchema = z.object({
  versaoId: z.string().min(1),
  persona: z.string().min(20).max(8000),
  provedor: z.enum(["anthropic", "gemini", "openai", "grok"]),
});

export async function salvarRascunhoAction(
  _prev: EstadoAgente,
  formData: FormData,
): Promise<EstadoAgente> {
  return comoEstado(async () => {
    const sessao = await exigir();
    const p = editarSchema.safeParse({
      versaoId: formData.get("versaoId"),
      persona: formData.get("persona"),
      provedor: formData.get("provedor"),
    });
    if (!p.success) throw new Error("Dados inválidos.");

    await runWithTenant({ empresaId: sessao.empresaId, usuarioId: sessao.usuarioId }, async () => {
      // Só rascunho é editável: versão publicada é imutável por definição — é
      // ela que as conversas em andamento estão usando.
      const alterada = await prisma.versaoAgente.updateMany({
        where: { id: p.data.versaoId, status: "rascunho" },
        data: { persona: p.data.persona, provedor: p.data.provedor },
      });
      if (alterada.count === 0) {
        throw new Error("Esta versão já foi publicada — crie um rascunho novo para editar.");
      }
    });
    revalidatePath("/agentes");
  });
}

/**
 * Publica o rascunho e abre o próximo.
 *
 * Sempre deixa um rascunho aberto depois de publicar: sem isso, editar exigiria
 * um clique em "criar rascunho" que não quer dizer nada para quem só quer
 * ajustar o texto.
 */
export async function publicarVersaoAction(formData: FormData): Promise<void> {
  const sessao = await exigir();
  const versaoId = String(formData.get("versaoId") ?? "");

  await runWithTenant({ empresaId: sessao.empresaId, usuarioId: sessao.usuarioId }, async () => {
    const versao = await prisma.versaoAgente.findUnique({ where: { id: versaoId } });
    if (!versao || versao.status !== "rascunho") {
      throw new Error("Só um rascunho pode ser publicado.");
    }

    await prisma.$transaction([
      // A anterior vai para `arquivada`, não é apagada: conversa em andamento
      // ainda aponta para ela, e o histórico precisa dizer com qual persona o
      // cliente falou.
      prisma.versaoAgente.updateMany({
        where: { agenteId: versao.agenteId, status: "publicada" },
        data: { status: "arquivada" },
      }),
      prisma.versaoAgente.update({
        where: { id: versaoId },
        data: { status: "publicada", publicadaEm: new Date() },
      }),
      prisma.agenteIA.update({
        where: { id: versao.agenteId },
        data: { versaoAtivaId: versaoId },
      }),
      prisma.versaoAgente.create({
        data: {
          agenteId: versao.agenteId,
          numero: versao.numero + 1,
          status: "rascunho",
          persona: versao.persona,
          provedor: versao.provedor,
          modelo: versao.modelo,
          toolsHabilitadas: versao.toolsHabilitadas as never,
        } as never,
      }),
    ]);
  });
  revalidatePath("/agentes");
}

const chaveSchema = z.object({
  provedor: z.enum(["anthropic", "gemini", "openai", "grok"]),
  apiKey: z.string().min(20).max(400),
});

/**
 * Guarda a chave do provedor de modelo do tenant.
 *
 * Mora em `IntegracaoExterna { categoria: "ia" }` e não num model próprio: sem
 * fallback para chave da plataforma, um `ConfigIAEmpresa` seria uma tabela com
 * uma coluna útil — e aqui já vêm cifragem AES-256-GCM, `status` e `ultimoErro`
 * (doc 11, divergência D1).
 *
 * A chave **nunca volta para a tela**: nem aqui, nem no `select` da página. O
 * que a interface mostra é se existe uma, não qual é.
 */
export async function salvarChaveIaAction(
  _prev: EstadoAgente,
  formData: FormData,
): Promise<EstadoAgente> {
  return comoEstado(async () => {
    const sessao = await exigir();
    const p = chaveSchema.safeParse({
      provedor: formData.get("provedor"),
      apiKey: formData.get("apiKey"),
    });
    if (!p.success) throw new Error("Informe uma chave válida (mínimo de 20 caracteres).");

    const credenciais = cifrarSegredo(JSON.stringify({ apiKey: p.data.apiKey }));

    await runWithTenant({ empresaId: sessao.empresaId, usuarioId: sessao.usuarioId }, async () => {
      const existente = await prisma.integracaoExterna.findFirst({
        where: { categoria: "ia", tipo: p.data.provedor },
      });

      if (existente) {
        await prisma.integracaoExterna.update({
          where: { id: existente.id },
          // Trocar a chave zera o erro anterior: manter `ultimoErro` faria a
          // tela seguir acusando credencial recusada depois de corrigida.
          data: { credenciaisCifradas: credenciais, status: "conectada", ultimoErro: null },
        });
        return;
      }

      await prisma.integracaoExterna.create({
        data: {
          categoria: "ia",
          tipo: p.data.provedor,
          nome: p.data.provedor,
          credenciaisCifradas: credenciais,
        } as never,
      });
    });
    revalidatePath("/agentes");
  });
}

export async function alternarAgenteAction(formData: FormData): Promise<void> {
  const sessao = await exigir();
  const id = String(formData.get("id") ?? "");
  const ativar = formData.get("ativar") === "1";

  await runWithTenant({ empresaId: sessao.empresaId, usuarioId: sessao.usuarioId }, async () => {
    await prisma.agenteIA.update({ where: { id }, data: { ativo: ativar } });
  });
  revalidatePath("/agentes");
}
