// Vocabulário das telas de configuração do atendimento: os rótulos que o tenant
// lê e as listas fechadas que os formulários oferecem.
//
// ARQUIVO SEM NENHUMA DEPENDÊNCIA, E ISSO É O PONTO. Ele é importado pelos
// componentes `"use client"`, e `@atende/core` reexporta o módulo de cripto, que
// abre com `import crypto from "node:crypto"` — pendurar o vocabulário no core
// arrastaria isso para o bundle do navegador. Aqui não há import nenhum: o que
// entra no cliente é uma tabela de strings.
//
// O que é CONTRATO continua no core e é validado no servidor: `distribuicaoSchema`
// (os valores) e `horarioFilaSchema` (o formato do expediente). Este arquivo só
// diz como cada valor se chama em português.

/** Dias na ordem em que a semana é lida e desenhada — segunda primeiro, como a operação. */
export const DIAS_DA_SEMANA = [
  { chave: "seg", rotulo: "Segunda", curto: "Seg" },
  { chave: "ter", rotulo: "Terça", curto: "Ter" },
  { chave: "qua", rotulo: "Quarta", curto: "Qua" },
  { chave: "qui", rotulo: "Quinta", curto: "Qui" },
  { chave: "sex", rotulo: "Sexta", curto: "Sex" },
  { chave: "sab", rotulo: "Sábado", curto: "Sáb" },
  { chave: "dom", rotulo: "Domingo", curto: "Dom" },
] as const;

export type ChaveDeDia = (typeof DIAS_DA_SEMANA)[number]["chave"];

/** Turnos por dia oferecidos pelo formulário — o segundo cobre o intervalo do almoço. */
export const TURNOS_POR_DIA = [1, 2] as const;

/**
 * Expediente no formato que o FORMULÁRIO desenha: HH:mm por turno, por dia.
 *
 * Mora aqui, e não em `schemas.ts`, porque quem o consome é o componente de
 * cliente — e `schemas.ts` importa `@atende/core`. Tipo é apagado na compilação,
 * mas manter o import fora do arquivo de cliente é o que impede que um `import`
 * de valor entre por descuido no mesmo caminho depois.
 */
export interface ExpedienteDoFormulario {
  readonly fuso: string;
  readonly dias: Partial<Record<ChaveDeDia, readonly (readonly [string, string])[]>>;
}

/**
 * Fusos oferecidos no formulário.
 *
 * Lista fechada, e não campo livre: o produto se vende como implantação sem
 * consultoria, e pedir que alguém digite `America/Porto_Velho` de cabeça é pedir
 * um erro de digitação que só aparece semanas depois — quando o prazo de uma fila
 * começa a contar na hora errada. Os doze cobrem o Brasil inteiro, e o
 * `horarioFilaSchema` ainda valida no servidor: lista desatualizada falha na
 * borda em vez de gravar lixo.
 */
export const FUSOS_DO_BRASIL = [
  { valor: "America/Sao_Paulo", rotulo: "Brasília — SP, RJ, MG, ES, PR, SC, RS, GO, DF, MS/TO parcial" },
  { valor: "America/Bahia", rotulo: "Bahia" },
  { valor: "America/Fortaleza", rotulo: "Ceará, Piauí, RN, PB" },
  { valor: "America/Recife", rotulo: "Pernambuco" },
  { valor: "America/Maceio", rotulo: "Alagoas e Sergipe" },
  { valor: "America/Belem", rotulo: "Pará (leste) e Amapá" },
  { valor: "America/Araguaina", rotulo: "Tocantins" },
  { valor: "America/Santarem", rotulo: "Pará (oeste)" },
  { valor: "America/Campo_Grande", rotulo: "Mato Grosso do Sul" },
  { valor: "America/Cuiaba", rotulo: "Mato Grosso" },
  { valor: "America/Manaus", rotulo: "Amazonas, Rondônia e Roraima" },
  { valor: "America/Rio_Branco", rotulo: "Acre" },
] as const;

export const FUSO_SUGERIDO = "America/Sao_Paulo";

/**
 * Como a fila distribui.
 *
 * A explicação vale mais que o rótulo: "carteira" e "carga" são palavras que o
 * gestor do distribuidor conhece do comercial, e o significado delas AQUI é
 * outro. O texto ao lado é o que evita a fila configurada por analogia errada —
 * e uma fila mal distribuída só se manifesta como cliente sem resposta.
 */
export const DISTRIBUICOES = [
  {
    valor: "manual",
    rotulo: "Manual",
    explicacao: "A conversa fica na fila até alguém assumir. Ninguém recebe sozinho.",
  },
  {
    valor: "rodizio",
    rotulo: "Rodízio",
    explicacao: "Um de cada vez, na ordem — cada conversa nova vai para o próximo da lista.",
  },
  {
    valor: "carga",
    rotulo: "Menor carga",
    explicacao: "Vai para quem está com menos conversas abertas neste momento.",
  },
  {
    valor: "carteira",
    rotulo: "Carteira",
    explicacao:
      "Vai para o vendedor dono do cliente. Se ele não atende esta fila, cai no rodízio — cliente esperando não é hora de fidelidade.",
  },
] as const;

/**
 * Cores de etiqueta: tokens do tema, nunca hex cru.
 *
 * O schema do banco pede token em comentário, e o motivo é tema: um `#22c55e`
 * escolhido no escuro (que é como o painel abre) vira ilegível no claro, e quem
 * cadastrou nunca vê o resultado. Os cinco valores são os tons do `Badge`, então
 * a etiqueta aparece igual aqui e na inbox.
 */
export const CORES_DE_ETIQUETA = [
  { valor: "neutro", rotulo: "Cinza" },
  { valor: "info", rotulo: "Azul" },
  { valor: "sucesso", rotulo: "Verde" },
  { valor: "atencao", rotulo: "Âmbar" },
  { valor: "perigo", rotulo: "Vermelho" },
] as const;

export type CorDeEtiqueta = (typeof CORES_DE_ETIQUETA)[number]["valor"];

/**
 * Teto dos prazos: 30 dias em minutos.
 *
 * Não é purismo. O prazo é consumido DENTRO do expediente
 * (`avancarNoExpediente`), que varre no máximo ~370 dias antes de desistir: um
 * prazo digitado com um zero a mais numa fila que abre poucas horas por semana
 * chega perto desse limite e devolve um vencimento sem sentido. Barrar na borda
 * dá mensagem clara em vez de data estranha no painel.
 */
export const PRAZO_MAXIMO_MIN = 30 * 24 * 60;

/**
 * Instante escrito NO FUSO DA FILA — "seg., 08:00".
 *
 * Não usa `formatarDataHora` do chassi de propósito: aquele lê o horário local
 * do processo, e no Cloudflare Workers o processo roda em UTC. "A fila abre às
 * 05:00" numa fila de São Paulo é o defeito que sai disso, e ele passa
 * despercebido em desenvolvimento, onde a máquina está no fuso certo.
 */
export function formatarNoFuso(quando: Date, fuso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(quando);
  } catch {
    // Fuso gravado antes de a lista fechar, ou ICU sem a zona: melhor omitir a
    // hora do que imprimir uma errada com cara de certa.
    return "";
  }
}

/** "90" → "1 h 30 min". O painel cobra o prazo em minutos; a leitura é em horas. */
export function formatarMinutos(minutos: number | null): string {
  if (minutos === null) return "sem prazo";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}
