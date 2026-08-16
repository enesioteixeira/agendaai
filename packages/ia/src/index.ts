/**
 * ADAPTERS DE PROVEDOR DE IA e o dispatcher `responder()`.
 *
 * Este pacote é o único do repo autorizado a importar SDK de modelo — mesma
 * regra anticorrupção de `@atende/canais` para SDK de canal. **Só o
 * `apps/worker` o importa**: turno de IA não roda no request do Cloudflare
 * Workers (10 ms de CPU contra um orçamento de 40 s — doc 12 §2.2).
 *
 * As DECISÕES não moram aqui: orçamento, provedor reserva, portão de PII e as
 * guardas vivem em `@atende/core/atendimento/ia`, puras e testadas. Aqui fica só
 * a tradução para cada SDK.
 */

import {
  aplicarPortaoPii,
  type ModoPii,
  type OpcoesResponder,
  type Provedor,
  type RespostaAgente,
} from "@atende/core";

export { MODELO_AVANCADO_ANTHROPIC, MODELO_PADRAO_ANTHROPIC, responderAnthropic } from "./anthropic";
export {
  MODELO_AVANCADO_GEMINI,
  MODELO_PADRAO_GEMINI,
  paraFunctionDeclarations,
  responderGemini,
} from "./gemini";
export {
  MODELO_AVANCADO_GROK,
  MODELO_AVANCADO_OPENAI,
  MODELO_PADRAO_GROK,
  MODELO_PADRAO_OPENAI,
  responderGrok,
  responderOpenAI,
} from "./openai-compat";
export { TIMEOUT_IA_MS } from "./http";

export interface OpcoesDoTurno extends OpcoesResponder {
  /** Modo do portão de PII do tenant. Padrão: `mascarar` (fail-safe). */
  readonly modoPii?: ModoPii;
}

/**
 * Ponto único de entrada do motor.
 *
 * O **portão de PII fica aqui**, e não em cada chamador, porque este é o único
 * lugar por onde todos os provedores passam — inclusive o próximo que alguém
 * escrever. Um portão espalhado pelos call sites é um portão que alguém esquece.
 *
 * O padrão é `mascarar`: se a configuração do tenant não chegou (bug, cache
 * frio, migração pela metade), o comportamento seguro é mascarar, não vazar.
 */
export async function responder(
  pergunta: string,
  opcoes: OpcoesDoTurno = {},
): Promise<RespostaAgente> {
  const provedor: Provedor = opcoes.provedor ?? "anthropic";

  const portao = aplicarPortaoPii(
    {
      pergunta,
      historico: opcoes.historico,
    },
    opcoes.modoPii ?? "mascarar",
  );

  if (portao.achados > 0) {
    // Só a CONTAGEM vai para o log. O valor encontrado, nunca — registrar o
    // dado que acabamos de mascarar desfaria o trabalho no arquivo de log.
    console.info(`[pii] ${portao.achados} ocorrência(s) tratada(s) antes de ${provedor}`);
  }

  const opcoesSeguras: OpcoesResponder = {
    ...opcoes,
    historico: portao.entrada.historico,
  };

  switch (provedor) {
    case "gemini": {
      const { responderGemini } = await import("./gemini");
      return responderGemini(portao.entrada.pergunta, opcoesSeguras);
    }
    case "openai": {
      const { responderOpenAI } = await import("./openai-compat");
      return responderOpenAI(portao.entrada.pergunta, opcoesSeguras);
    }
    case "grok": {
      const { responderGrok } = await import("./openai-compat");
      return responderGrok(portao.entrada.pergunta, opcoesSeguras);
    }
    default: {
      const { responderAnthropic } = await import("./anthropic");
      return responderAnthropic(portao.entrada.pergunta, opcoesSeguras);
    }
  }
}
