"use server";

// Server Actions das telas de CONFIGURAÇÃO DA OPERAÇÃO (E1): filas, motivos de
// encerramento, etiquetas e respostas rápidas.
//
// Padrão do repositório, sem desvio: sessão → escopo (matriz doc 02 §13) → Zod →
// `runWithTenant` → camada de dados de `@atende/db` → `revalidatePath`. Nenhuma
// consulta Prisma nasce aqui: quem fala com o banco é `@atende/db/atendimento/*`,
// que já roda sob a extension de tenancy (regra inviolável 1) e já traduz
// conflito de unicidade em frase de gente.
//
// ARQUIVO SEPARADO DE `actions.ts` DE PROPÓSITO. Aquele é o da INBOX — assumir,
// responder, encerrar — e é mexido a cada mudança do atendimento ao vivo. Este é
// o do cadastro, que muda com o produto. Juntá-los faria dois times editarem o
// mesmo arquivo para trabalhos que não se tocam, e "use server" transforma cada
// export em endpoint: um arquivo só ficaria com quatorze deles e nenhuma pista de
// qual tela chama qual.
//
// TODA ação devolve ESTADO (`{ erro }` / `{ ok }`), nunca lança. Erro de
// configuração é rotina — nome de fila repetido, atalho já usado, prazo digitado
// com vírgula — e a tela de erro do Next para um nome duplicado faz o usuário
// achar que quebrou o sistema, quando só precisava trocar uma palavra.

import { revalidatePath } from "next/cache";

import { temEscopo, type SessaoPayload } from "@atende/core";
import {
  arquivarEtiqueta,
  arquivarFila,
  arquivarMotivoEncerramento,
  arquivarRespostaRapida,
  atualizarFila,
  atualizarRespostaRapida,
  criarEtiqueta,
  criarFila,
  criarMotivoEncerramento,
  criarRespostaRapida,
  definirMembrosDaFila,
  runWithTenant,
} from "@atende/db";

import { lerSessao } from "@/lib/sessao";
import {
  etiquetaFormSchema,
  filaFormSchema,
  idSchema,
  membrosFormSchema,
  montarHorarioDoFormulario,
  motivoFormSchema,
  respostaRapidaFormSchema,
} from "./schemas";

export interface EstadoDeConfiguracao {
  erro?: string;
  ok?: boolean;
}

/** Escopo único das quatro telas — quem configura fila configura o catálogo dela. */
const ESCOPO = "atendimento:configurar";

const ROTA_FILAS = "/configuracoes/atendimento/filas";
const ROTA_CATALOGOS = "/configuracoes/atendimento/catalogos";
const ROTA_RESPOSTAS = "/configuracoes/atendimento/respostas";

async function exigirSessao(): Promise<SessaoPayload> {
  const sessao = await lerSessao();
  if (!sessao) throw new Error("Sessão expirada — entre novamente.");
  if (!temEscopo(sessao, ESCOPO)) {
    throw new Error("Seu papel não configura o atendimento. Peça o escopo atendimento:configurar.");
  }
  return sessao;
}

/**
 * Extrai a frase que vai para a tela.
 *
 * O `ZodError` é reconhecido por FORMA (tem `issues`), e não por `instanceof`:
 * as mensagens que interessam vêm do Zod de `@atende/db`, e um dia em que o
 * gerenciador de pacotes resolver duas cópias de zod o `instanceof` passa a ser
 * falso em silêncio — e o usuário recebe um JSON de issues no lugar do texto.
 * A checagem por forma continua valendo nas duas situações.
 */
function mensagemDoErro(erro: unknown): string {
  const issues = (erro as { issues?: unknown }).issues;
  if (Array.isArray(issues)) {
    const primeira = issues[0] as { message?: unknown } | undefined;
    if (typeof primeira?.message === "string") return primeira.message;
  }
  if (erro instanceof Error && erro.message.length > 0) return erro.message;
  return "Não foi possível salvar. Tente de novo.";
}

function comoEstado(fn: () => Promise<void>): Promise<EstadoDeConfiguracao> {
  return fn()
    .then(() => ({ ok: true }) as EstadoDeConfiguracao)
    .catch((erro) => ({ erro: mensagemDoErro(erro) }));
}

function contexto(s: SessaoPayload) {
  return { empresaId: s.empresaId, usuarioId: s.usuarioId };
}

/** Campo de texto do `FormData`: sempre string, para o Zod nunca ver `File | null`. */
function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

/** Checkbox/campo ausente vira `null` — é assim que `montarHorarioDoFormulario` lê "dia fechado". */
function opcional(formData: FormData): (campo: string) => string | null {
  return (campo) => {
    const valor = formData.get(campo);
    return typeof valor === "string" ? valor : null;
  };
}

/**
 * Revalida a inbox junto com a tela de configuração.
 *
 * Fila, etiqueta, motivo e resposta rápida são MENUS da inbox: arquivar um
 * motivo e continuar vendo-o no seletor de encerramento por causa de cache é o
 * tipo de bug que o usuário reporta como "não salvou" — e aí ele salva de novo,
 * e de novo.
 */
function revalidarInbox(): void {
  revalidatePath("/inbox");
}

// ─────────────────────────────────────────────────────────────
// Filas
// ─────────────────────────────────────────────────────────────

/**
 * Lê os campos comuns de criação e edição.
 *
 * O expediente sai de `montarHorarioDoFormulario` (checkbox por dia + dois
 * turnos) e é validado pelo `horarioFilaSchema` do core — o MESMO schema que o
 * roteador usa para ler. Sem passar por ele aqui, um "18:0" digitado sem o zero
 * viraria expediente ilegível: o núcleo é tolerante na leitura (cai para 24 por
 * 7) e a fila que o usuário acha que fecha às 18h prometeria prazo de madrugada.
 */
function lerFormularioDeFila(formData: FormData) {
  return filaFormSchema.safeParse({
    nome: texto(formData, "nome"),
    descricao: texto(formData, "descricao"),
    distribuicao: texto(formData, "distribuicao"),
    prazoPrimeiraRespostaMin: texto(formData, "prazoPrimeiraRespostaMin"),
    prazoResolucaoMin: texto(formData, "prazoResolucaoMin"),
    horarioJson: montarHorarioDoFormulario(opcional(formData)),
    mensagemForaHorario: texto(formData, "mensagemForaHorario"),
  });
}

export async function criarFilaAction(
  _anterior: EstadoDeConfiguracao,
  formData: FormData,
): Promise<EstadoDeConfiguracao> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const lido = lerFormularioDeFila(formData);
    if (!lido.success) throw lido.error;

    await runWithTenant(contexto(sessao), () => criarFila(lido.data));
    revalidatePath(ROTA_FILAS);
    revalidarInbox();
  });
}

export async function atualizarFilaAction(
  _anterior: EstadoDeConfiguracao,
  formData: FormData,
): Promise<EstadoDeConfiguracao> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const id = idSchema.safeParse({ id: texto(formData, "id") });
    if (!id.success) throw id.error;
    const lido = lerFormularioDeFila(formData);
    if (!lido.success) throw lido.error;

    await runWithTenant(contexto(sessao), () => atualizarFila(id.data.id, lido.data));
    revalidatePath(ROTA_FILAS);
    revalidarInbox();
  });
}

export async function arquivarFilaAction(
  _anterior: EstadoDeConfiguracao,
  formData: FormData,
): Promise<EstadoDeConfiguracao> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const lido = idSchema.safeParse({ id: texto(formData, "id") });
    if (!lido.success) throw lido.error;

    await runWithTenant(contexto(sessao), () => arquivarFila(lido.data.id));
    revalidatePath(ROTA_FILAS);
    revalidarInbox();
  });
}

/**
 * Define os membros da fila — lista COMPLETA, não incremental.
 *
 * `getAll` devolve `[]` quando nenhuma caixa está marcada, e é isso que esvazia
 * a fila. Um formulário que só mandasse os marcados quando existissem faria
 * "desmarcar todo mundo e salvar" virar um salvamento sem efeito — o usuário
 * repetiria a operação achando que o clique não pegou.
 */
export async function definirMembrosAction(
  _anterior: EstadoDeConfiguracao,
  formData: FormData,
): Promise<EstadoDeConfiguracao> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const lido = membrosFormSchema.safeParse({
      filaId: texto(formData, "filaId"),
      usuarioIds: formData.getAll("usuarioIds").filter((v) => typeof v === "string"),
    });
    if (!lido.success) throw lido.error;

    await runWithTenant(contexto(sessao), () =>
      definirMembrosDaFila(lido.data.filaId, lido.data.usuarioIds),
    );
    revalidatePath(ROTA_FILAS);
    revalidarInbox();
  });
}

// ─────────────────────────────────────────────────────────────
// Motivos de encerramento e etiquetas
// ─────────────────────────────────────────────────────────────

export async function criarMotivoAction(
  _anterior: EstadoDeConfiguracao,
  formData: FormData,
): Promise<EstadoDeConfiguracao> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const lido = motivoFormSchema.safeParse({ nome: texto(formData, "nome") });
    if (!lido.success) throw lido.error;

    await runWithTenant(contexto(sessao), () => criarMotivoEncerramento(lido.data.nome));
    revalidatePath(ROTA_CATALOGOS);
    revalidarInbox();
  });
}

export async function arquivarMotivoAction(
  _anterior: EstadoDeConfiguracao,
  formData: FormData,
): Promise<EstadoDeConfiguracao> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const lido = idSchema.safeParse({ id: texto(formData, "id") });
    if (!lido.success) throw lido.error;

    await runWithTenant(contexto(sessao), () => arquivarMotivoEncerramento(lido.data.id));
    revalidatePath(ROTA_CATALOGOS);
    revalidarInbox();
  });
}

export async function criarEtiquetaAction(
  _anterior: EstadoDeConfiguracao,
  formData: FormData,
): Promise<EstadoDeConfiguracao> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const lido = etiquetaFormSchema.safeParse({
      nome: texto(formData, "nome"),
      cor: texto(formData, "cor"),
    });
    if (!lido.success) throw lido.error;

    await runWithTenant(contexto(sessao), () => criarEtiqueta(lido.data));
    revalidatePath(ROTA_CATALOGOS);
    revalidarInbox();
  });
}

export async function arquivarEtiquetaAction(
  _anterior: EstadoDeConfiguracao,
  formData: FormData,
): Promise<EstadoDeConfiguracao> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const lido = idSchema.safeParse({ id: texto(formData, "id") });
    if (!lido.success) throw lido.error;

    await runWithTenant(contexto(sessao), () => arquivarEtiqueta(lido.data.id));
    revalidatePath(ROTA_CATALOGOS);
    revalidarInbox();
  });
}

// ─────────────────────────────────────────────────────────────
// Respostas rápidas
// ─────────────────────────────────────────────────────────────

export async function criarRespostaRapidaAction(
  _anterior: EstadoDeConfiguracao,
  formData: FormData,
): Promise<EstadoDeConfiguracao> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const lido = respostaRapidaFormSchema.safeParse({
      atalho: texto(formData, "atalho"),
      titulo: texto(formData, "titulo"),
      texto: texto(formData, "texto"),
      filaId: texto(formData, "filaId"),
    });
    if (!lido.success) throw lido.error;

    await runWithTenant(contexto(sessao), () => criarRespostaRapida(lido.data));
    revalidatePath(ROTA_RESPOSTAS);
    revalidarInbox();
  });
}

export async function atualizarRespostaRapidaAction(
  _anterior: EstadoDeConfiguracao,
  formData: FormData,
): Promise<EstadoDeConfiguracao> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const id = idSchema.safeParse({ id: texto(formData, "id") });
    if (!id.success) throw id.error;
    const lido = respostaRapidaFormSchema.safeParse({
      atalho: texto(formData, "atalho"),
      titulo: texto(formData, "titulo"),
      texto: texto(formData, "texto"),
      filaId: texto(formData, "filaId"),
    });
    if (!lido.success) throw lido.error;

    // Os quatro campos vão SEMPRE, inclusive `filaId: null`: o formulário é a
    // fotografia completa da resposta, e "sem fila" precisa poder desfazer uma
    // restrição — a camada de dados distingue `undefined` (não mexe) de `null`
    // (torna geral), e mandar `undefined` aqui deixaria a restrição grudada.
    await runWithTenant(contexto(sessao), () => atualizarRespostaRapida(id.data.id, lido.data));
    revalidatePath(ROTA_RESPOSTAS);
    revalidarInbox();
  });
}

export async function arquivarRespostaRapidaAction(
  _anterior: EstadoDeConfiguracao,
  formData: FormData,
): Promise<EstadoDeConfiguracao> {
  return comoEstado(async () => {
    const sessao = await exigirSessao();
    const lido = idSchema.safeParse({ id: texto(formData, "id") });
    if (!lido.success) throw lido.error;

    await runWithTenant(contexto(sessao), () => arquivarRespostaRapida(lido.data.id));
    revalidatePath(ROTA_RESPOSTAS);
    revalidarInbox();
  });
}
