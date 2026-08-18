"use server";

// Server Actions da OPERAÇÃO da inbox: encerrar com motivo, etiquetar e escrever
// nota interna.
//
// Padrão do repositório, sem desvio: sessão → escopo (matriz doc 02 §13) → Zod →
// `runWithTenant` → camada de dados de `@atende/db` → `revalidatePath`. Nenhuma
// consulta Prisma nasce aqui: quem fala com o banco é `@atende/db/atendimento/*`,
// que já roda sob a extension de tenancy (regra inviolável 1), já confere que a
// conversa e o motivo são DESTE tenant e já traduz conflito em frase de gente.
//
// ARQUIVO SEPARADO DE `modules/atendimento/actions.ts`, que continua dono de
// assumir/devolver/responder. A divisão é a mesma que aquele arquivo já explica:
// `"use server"` transforma cada export num endpoint, e juntar tudo daria um
// arquivo com uma dezena deles e nenhuma pista de qual tela chama qual. O que
// mora aqui é o que a inbox ganhou com a operação de atendimento (E1).
//
// TODA ação devolve ESTADO (`{ erro }` / `{ ok }`), nunca lança. Encerrar uma
// conversa que outro atendente acabou de encerrar, etiquetar com uma etiqueta
// que alguém arquivou no minuto anterior — é rotina de time, não falha de
// sistema, e a tela de erro do Next no meio de um atendimento faz o operador
// achar que derrubou o produto.

import { revalidatePath } from "next/cache";

import { temEscopo, type SessaoPayload } from "@atende/core";
import {
  aplicarEtiqueta,
  criarNotaDeConversa,
  encerrarConversa,
  removerEtiqueta,
  runWithTenant,
} from "@atende/db";
import { z } from "zod";

import { lerSessao } from "@/lib/sessao";

export interface EstadoDaInbox {
  erro?: string;
  ok?: boolean;
}

/** Quem responde a conversa também a encerra, etiqueta e anota. */
const ESCOPO = "atendimento:responder";

async function exigirSessao(): Promise<SessaoPayload> {
  const sessao = await lerSessao();
  if (!sessao) throw new Error("Sessão expirada — entre novamente.");
  if (!temEscopo(sessao, ESCOPO)) {
    throw new Error("Seu papel não atende conversas. Peça o escopo atendimento:responder.");
  }
  return sessao;
}

/**
 * Extrai a frase que vai para a tela.
 *
 * `ZodError` reconhecido por FORMA e não por `instanceof`, pelo mesmo motivo
 * escrito em `modules/atendimento/configuracao-actions.ts`: as mensagens úteis
 * vêm do zod de `@atende/db`, e duas cópias resolvidas do pacote fariam o
 * `instanceof` ser falso em silêncio — o usuário receberia um JSON de issues.
 */
function mensagemDoErro(erro: unknown): string {
  const issues = (erro as { issues?: unknown }).issues;
  if (Array.isArray(issues)) {
    const primeira = issues[0] as { message?: unknown } | undefined;
    if (typeof primeira?.message === "string") return primeira.message;
  }
  if (erro instanceof Error && erro.message.length > 0) return erro.message;
  return "Não foi possível concluir. Tente de novo.";
}

function comoEstado(fn: () => Promise<void>): Promise<EstadoDaInbox> {
  return fn()
    .then(() => ({ ok: true }) as EstadoDaInbox)
    .catch((erro) => ({ erro: mensagemDoErro(erro) }));
}

function contexto(s: SessaoPayload) {
  return { empresaId: s.empresaId, usuarioId: s.usuarioId };
}

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

/** A conversa aberta e a lista mudam juntas — etiqueta e encerramento aparecem nas duas. */
function revalidarInbox(conversaId: string): void {
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${conversaId}`);
}

const conversaSchema = z.object({
  conversaId: z.string().min(1, "Conversa não informada."),
});

/**
 * Encerrar com motivo.
 *
 * O motivo é OBRIGATÓRIO na borda **e** no banco: `encerrarConversa` recusa id
 * vazio, motivo de outra empresa e motivo arquivado. Validar só aqui deixaria a
 * regra do lado errado do endpoint — `"use server"` publica esta função, e um
 * POST montado à mão não passa pelo `<select>` da tela.
 *
 * É o motivo que transforma a inbox em relatório de demanda: sem ele, no mês
 * seguinte ninguém sabe por que as conversas terminaram. Por isso não existe
 * "encerrar sem motivo" nem como atalho de teclado.
 */
const encerrarSchema = conversaSchema.extend({
  motivoEncerramentoId: z.string().min(1, "Escolha o motivo do encerramento."),
});

export async function encerrarComMotivoAction(
  _prev: EstadoDaInbox,
  formData: FormData,
): Promise<EstadoDaInbox> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const dados = encerrarSchema.parse({
      conversaId: texto(formData, "conversaId"),
      motivoEncerramentoId: texto(formData, "motivoEncerramentoId"),
    });

    await runWithTenant(contexto(sessao), () =>
      encerrarConversa(dados.conversaId, dados.motivoEncerramentoId),
    );
    revalidarInbox(dados.conversaId);
  });
}

const etiquetaSchema = conversaSchema.extend({
  etiquetaId: z.string().min(1, "Etiqueta não informada."),
});

export async function aplicarEtiquetaAction(
  _prev: EstadoDaInbox,
  formData: FormData,
): Promise<EstadoDaInbox> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const dados = etiquetaSchema.parse({
      conversaId: texto(formData, "conversaId"),
      etiquetaId: texto(formData, "etiquetaId"),
    });

    await runWithTenant(contexto(sessao), () =>
      aplicarEtiqueta(dados.conversaId, dados.etiquetaId),
    );
    revalidarInbox(dados.conversaId);
  });
}

export async function removerEtiquetaAction(
  _prev: EstadoDaInbox,
  formData: FormData,
): Promise<EstadoDaInbox> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const dados = etiquetaSchema.parse({
      conversaId: texto(formData, "conversaId"),
      etiquetaId: texto(formData, "etiquetaId"),
    });

    await runWithTenant(contexto(sessao), () =>
      removerEtiqueta(dados.conversaId, dados.etiquetaId),
    );
    revalidarInbox(dados.conversaId);
  });
}

/**
 * Nota interna.
 *
 * ENDPOINT SEPARADO DE `responderConversaAction`, e essa separação é a garantia
 * estrutural de que nota não vaza para o cliente: aqui não existe caminho para
 * criar `Mensagem` nem para enfileirar envio — `criarNotaDeConversa` grava em
 * `NotaConversa` e acabou. A tela reforça isso com dois `<form>` distintos (ver
 * `Composer.tsx`); mesmo que alguém troque o desenho amanhã, o texto de uma nota
 * chega numa função que não sabe enviar.
 *
 * O autor vem da SESSÃO, nunca do formulário. Um `autorUsuarioId` em campo
 * oculto deixaria qualquer um assinar nota com o nome de outro atendente — e
 * nota interna é o que o time lê para decidir como tratar o cliente.
 */
const notaSchema = conversaSchema.extend({
  texto: z
    .string()
    .trim()
    .min(1, "Escreva a nota antes de salvar.")
    .max(4000, "A nota pode ter no máximo 4000 caracteres."),
});

export async function criarNotaInternaAction(
  _prev: EstadoDaInbox,
  formData: FormData,
): Promise<EstadoDaInbox> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const dados = notaSchema.parse({
      conversaId: texto(formData, "conversaId"),
      texto: texto(formData, "nota"),
    });

    await runWithTenant(contexto(sessao), () =>
      criarNotaDeConversa(dados.conversaId, sessao.usuarioId, dados.texto),
    );
    revalidarInbox(dados.conversaId);
  });
}
