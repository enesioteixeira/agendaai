// Contratos de ENTRADA das telas de configuração da operação (E1) — filas,
// motivos de encerramento, etiquetas e respostas rápidas.
//
// POR QUE ESTES SCHEMAS NÃO ESTÃO EM `@atende/core`. A regra inviolável 14 manda
// os schemas Zod viverem no core porque lá eles são o CONTRATO entre `apps/web` e
// `apps/worker`. Estes não são: são o formato do `FormData` de um formulário do
// painel — "prazo em minutos vem como string vazia quando o campo está em branco"
// é assunto de HTML, não de domínio. O que é domínio já mora no core e é
// REUSADO aqui: `horarioFilaSchema` (formato do `Fila.horarioJson`) e
// `distribuicaoSchema` (o enum de distribuição). Inventar um segundo formato de
// expediente aqui seria o caminho para o painel gravar um Json que o roteador do
// worker não sabe ler.
//
// Toda mensagem de erro é escrita para ser exibida como está na tela: sem "campo
// inválido", sem nome de campo em inglês, sem código.

import { z } from "zod";

import { distribuicaoSchema, horarioFilaSchema } from "@atende/core";

import {
  DIAS_DA_SEMANA,
  PRAZO_MAXIMO_MIN,
  TURNOS_POR_DIA,
  type ChaveDeDia,
  type ExpedienteDoFormulario,
} from "./vocabulario";

const nomeDeFila = z
  .string()
  .trim()
  .min(2, "O nome da fila precisa de pelo menos 2 caracteres.")
  .max(60, "O nome da fila pode ter no máximo 60 caracteres.");

/**
 * Campo de texto opcional: `""` (input vazio) e ausente viram `null`.
 *
 * Sem isso, salvar um formulário sem descrição gravaria string vazia — e a tela
 * passaria a distinguir "sem descrição" de "descrição em branco", distinção que
 * não existe para quem usa.
 */
function textoOpcional(max: number, mensagem: string) {
  return z
    .string()
    .trim()
    .max(max, mensagem)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .default(null);
}

/**
 * Minutos vindos do formulário. `""` é "sem prazo", não zero.
 *
 * A conversão é feita à mão, e não com `z.coerce.number()`, por causa da
 * MENSAGEM: o coerce reprova "2h" com "Expected number, received nan" — inglês,
 * vocabulário de compilador, no meio de uma tela em português. Aqui todo caminho
 * de erro sai como frase, e a vírgula decimal é tratada porque teclado brasileiro
 * a produz sozinha ("1,5" vira 1.5, que não é inteiro, e o texto explica o que
 * fazer em vez de acusar tipo).
 */
const prazoEmMinutos = z.string().transform((bruto, ctx) => {
  const valor = bruto.trim();
  if (valor === "") return null;

  const numero = Number(valor.replace(",", "."));
  if (!Number.isFinite(numero) || !Number.isInteger(numero) || numero <= 0) {
    ctx.addIssue({
      code: "custom",
      message:
        "O prazo é um número inteiro de minutos (ex.: 15). Deixe em branco para a fila não ter prazo.",
    });
    return z.NEVER;
  }
  if (numero > PRAZO_MAXIMO_MIN) {
    ctx.addIssue({ code: "custom", message: "O prazo não pode passar de 30 dias." });
    return z.NEVER;
  }
  return numero;
});

/**
 * Expediente: ou um `horarioFilaSchema` válido, ou `null` (fila 24 por 7).
 *
 * `null` é escolha do usuário — "não configurar expediente" — e não erro. O core
 * já trata `null`, JSON quebrado e semana vazia com o mesmo comportamento (24 por
 * 7); aqui gravamos `null` explícito para que a tela mostre "sempre aberta" em
 * vez de um objeto vazio que ninguém entende.
 */
const expediente = horarioFilaSchema.nullable().default(null);

/**
 * Distribuição: o enum canônico é o do core, não uma cópia.
 *
 * O `transform` existe só para trocar a mensagem — a do Zod para enum é em
 * inglês e lista os valores internos ("rodizio", "carga"), que não são o
 * vocabulário da tela. Copiar o enum para cá daria a mensagem certa e a dívida
 * errada: um valor novo no core passaria a ser recusado aqui sem ninguém notar.
 */
const distribuicaoDoFormulario = z.string().transform((valor, ctx) => {
  const lido = distribuicaoSchema.safeParse(valor);
  if (!lido.success) {
    ctx.addIssue({
      code: "custom",
      message: "Escolha como a fila distribui: rodízio, carga, carteira ou manual.",
    });
    return z.NEVER;
  }
  return lido.data;
});

export const filaFormSchema = z.object({
  nome: nomeDeFila,
  descricao: textoOpcional(200, "A descrição pode ter no máximo 200 caracteres."),
  distribuicao: distribuicaoDoFormulario,
  prazoPrimeiraRespostaMin: prazoEmMinutos,
  prazoResolucaoMin: prazoEmMinutos,
  horarioJson: expediente,
  mensagemForaHorario: textoOpcional(
    500,
    "A mensagem de fora do horário pode ter no máximo 500 caracteres.",
  ),
});

export type FilaForm = z.infer<typeof filaFormSchema>;

export const membrosFormSchema = z.object({
  filaId: z.string().min(1, "Fila não informada."),
  usuarioIds: z.array(z.string().min(1)),
});

export const motivoFormSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "O motivo precisa de pelo menos 2 caracteres.")
    .max(60, "O motivo pode ter no máximo 60 caracteres."),
});

/**
 * Cor da etiqueta: token do tema, nunca hex cru (o porquê está em
 * `vocabulario.ts`, junto da lista que a tela oferece). Os valores são
 * literais aqui porque `z.enum` precisa da tupla em tempo de tipo — a lista de
 * `vocabulario.ts` é a mesma, e o teste de tipo do `defaultValue` do `<select>`
 * denuncia se as duas divergirem.
 */
export const corDeEtiquetaSchema = z.enum(["neutro", "info", "sucesso", "atencao", "perigo"], {
  errorMap: () => ({ message: "Escolha uma das cores oferecidas." }),
});

export const etiquetaFormSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "A etiqueta precisa de pelo menos 2 caracteres.")
    .max(60, "A etiqueta pode ter no máximo 60 caracteres."),
  cor: corDeEtiquetaSchema.default("neutro"),
});

/**
 * Resposta rápida.
 *
 * O ATALHO É VALIDADO DE PROPÓSITO PELA METADE AQUI. A forma canônica — sem
 * barra, sem espaço, sem acento, minúscula — é de `normalizarAtalho` /
 * `atalhoRespostaRapidaSchema` em `@atende/db`, porque é ela que precisa casar
 * com o unique `(empresaId, atalho)` e com a busca do composer. Repetir a regra
 * neste arquivo criaria duas verdades que envelhecem separadas: o dia em que o
 * composer aceitar ponto no atalho, esta tela passaria a recusar um atalho que o
 * banco aceita, e ninguém ligaria os dois fatos. O que fica aqui é só o que a
 * tela precisa responder na hora: campo em branco. O resto sobe do banco já em
 * português, e a action mostra a mensagem como veio.
 */
export const respostaRapidaFormSchema = z.object({
  atalho: z
    .string()
    .trim()
    .min(1, "Informe um atalho (ex.: /prazo).")
    .max(60, "Atalho longo demais."),
  titulo: z
    .string()
    .trim()
    .min(2, "O título precisa de pelo menos 2 caracteres.")
    .max(80, "O título pode ter no máximo 80 caracteres."),
  texto: z
    .string()
    .trim()
    .min(1, "Escreva o texto que será inserido na conversa.")
    .max(4000, "O texto pode ter no máximo 4000 caracteres."),
  /** `null` = vale para toda a empresa. */
  filaId: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .default(null),
});

export type RespostaRapidaForm = z.infer<typeof respostaRapidaFormSchema>;

/** Só o id — usado por arquivar, que não tem outro campo. */
export const idSchema = z.object({ id: z.string().min(1, "Registro não informado.") });

/**
 * Monta o `horarioJson` a partir dos campos do formulário.
 *
 * FORMA DO FORMULÁRIO. Por dia existem: `dia-<chave>` (checkbox "abre"),
 * `<chave>-1-inicio`/`<chave>-1-fim` e `<chave>-2-inicio`/`<chave>-2-fim`. Dois
 * turnos por dia, não N: turno partido (almoço) é o caso real do distribuidor, e
 * uma interface de faixas dinâmicas exigiria JavaScript para adicionar linha —
 * este formulário funciona sem JS, como os outros do painel.
 *
 * Dia desmarcado, ou marcado com os dois turnos em branco, some do Json: o core
 * lê dia ausente como fechado. E se a semana inteira ficar vazia, devolvemos
 * `null` — que é "sem expediente, 24 por 7" — em vez de um objeto de dias vazios,
 * porque é assim que o core interpreta os dois casos de qualquer forma, e `null`
 * é o que a tela consegue explicar.
 */
export function montarHorarioDoFormulario(ler: (campo: string) => string | null): unknown | null {
  const dias: Record<string, [string, string][]> = {};

  for (const { chave } of DIAS_DA_SEMANA) {
    if (ler(`dia-${chave}`) === null) continue;

    const faixas: [string, string][] = [];
    for (const turno of TURNOS_POR_DIA) {
      const inicio = (ler(`${chave}-${turno}-inicio`) ?? "").trim();
      const fim = (ler(`${chave}-${turno}-fim`) ?? "").trim();
      if (inicio === "" && fim === "") continue;
      faixas.push([inicio, fim]);
    }
    if (faixas.length > 0) dias[chave] = faixas;
  }

  if (Object.keys(dias).length === 0) return null;

  // Fuso em branco sai do objeto para o `.default(FUSO_PADRAO)` do core valer.
  // Mandar `""` seria pior que não mandar: reprova no `min(1)` e o usuário lê
  // "fuso inválido" num campo que ele nunca viu, porque o `<select>` tem valor
  // desde a primeira renderização.
  const fuso = (ler("fuso") ?? "").trim();
  return fuso === "" ? { dias } : { fuso, dias };
}

/**
 * Caminho inverso de `montarHorarioDoFormulario`: o `horarioJson` gravado volta
 * a ser campos preenchidos.
 *
 * Usa `horarioFilaSchema` e NÃO `lerExpediente` do core: aquele normaliza as
 * faixas para minutos desde a meia-noite (é o que o cálculo precisa), e desfazer
 * a conta para reescrever "08:00" perderia a distinção entre o que o usuário
 * digitou e o que o núcleo fundiu. Aqui queremos exatamente o que foi gravado.
 *
 * Expediente ilegível devolve `null` — a tela mostra a fila como 24 por 7, que é
 * como o roteador de fato a trata. Mentir na tela seria pior que o dado ruim.
 */
export function lerHorarioParaFormulario(horarioJson: unknown): ExpedienteDoFormulario | null {
  if (horarioJson === null || horarioJson === undefined) return null;
  const lido = horarioFilaSchema.safeParse(horarioJson);
  if (!lido.success) return null;

  const dias: Partial<Record<ChaveDeDia, readonly (readonly [string, string])[]>> = {};
  let algumDiaAberto = false;
  for (const { chave } of DIAS_DA_SEMANA) {
    const faixas = lido.data.dias[chave] ?? [];
    if (faixas.length === 0) continue;
    algumDiaAberto = true;
    dias[chave] = faixas.map((f) => [f[0], f[1]] as const);
  }

  return algumDiaAberto ? { fuso: lido.data.fuso, dias } : null;
}
