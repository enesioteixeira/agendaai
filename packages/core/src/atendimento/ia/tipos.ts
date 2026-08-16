// O contrato comum dos provedores de IA. Port adaptado de
// `ev-tracker/src/lib/esteira/agent.ts`, sem o dominio do EV Tracker.
//
// Este arquivo e o que os adapters (Anthropic, Gemini, OpenAI/Grok) vao
// implementar na proxima etapa da Fase C. Ele existe ANTES deles de proposito:
// e o contrato que impede cada adapter de inventar a propria forma e o motor de
// virar um `if (provedor === ...)` espalhado.

import type { Provedor } from "./tentativa";

export interface MensagemHistorico {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/** Anexo enviado na mensagem atual (imagem ou PDF), em base64. */
export interface AnexoIA {
  readonly mime: string;
  readonly dataBase64: string;
  readonly nome?: string;
}

/**
 * Uma ferramenta oferecida ao modelo no turno.
 *
 * O formato canonico e o do Anthropic (`name` / `description` / `input_schema`
 * em JSON Schema) porque foi o que o ev-tracker provou em producao com quatro
 * provedores: os outros convertem a partir dele, e a conversao mora no adapter.
 *
 * ⚠️ O Gemini REJEITA (400) uma tool do tipo OBJECT com `properties` vazio, e o
 * erro derruba a conversa inteira, nao so a chamada da ferramenta. Quem
 * converter para o formato do Gemini precisa omitir `parameters` quando nao ha
 * argumento — e a catraca daquele projeto (`tools-schema.test.ts`) existe
 * exatamente para isso.
 */
export interface ToolDoTurno {
  readonly name: string;
  readonly description: string;
  readonly input_schema: {
    readonly type: "object";
    readonly properties?: Record<string, unknown>;
    readonly required?: readonly string[];
  };
}

/** Consumo do turno — alimenta o metering por tenant (doc 12 §5.6). */
export interface UsoDeTokens {
  readonly entrada: number;
  readonly saida: number;
}

export interface RespostaAgente {
  readonly texto: string;
  readonly toolsUsadas: readonly { readonly nome: string; readonly input: unknown }[];
  readonly modelo: string;
  readonly provedor: Provedor;
  readonly uso: UsoDeTokens;
  /**
   * Avisos que o chamador anexa A FORCA a resposta — nao passam pelo modelo.
   * Existem porque ele ja parafraseou falha de ferramenta como sucesso.
   */
  readonly avisos: readonly string[];
}

export interface OpcoesResponder {
  readonly provedor?: Provedor;
  readonly modelo?: string;
  readonly historico?: readonly MensagemHistorico[];
  readonly maxIteracoes?: number;
  readonly apiKey?: string;
  readonly maxTokens?: number;
  /** Prompt de sistema completo. Quem o monta e o chamador (Fase D: a persona do agente). */
  readonly sistema?: string;
  readonly anexos?: readonly AnexoIA[];
  /** Ferramentas do turno. Vazio = geracao de texto puro, sem laco de tool use. */
  readonly tools?: readonly ToolDoTurno[];
  /** Executa uma ferramenta pedida pelo modelo e devolve o resultado ja empacotado. */
  readonly executarTool?: (nome: string, input: unknown) => Promise<string>;
  /** Teto de tempo do turno inteiro; o adapter para de iterar ao estourar. */
  readonly orcamentoMs?: number;
}
