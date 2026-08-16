// Adapter Anthropic (Claude) — laco de tool use.
// Port de `ev-tracker/src/lib/esteira/provedores/anthropic.ts`, sem o dominio
// daquele projeto: prompt, tools e execucao de tool chegam por parametro.

import Anthropic from "@anthropic-ai/sdk";
import type { OpcoesResponder, RespostaAgente, ToolDoTurno } from "@atende/core";

import { TIMEOUT_IA_MS } from "./http";

export const MODELO_PADRAO_ANTHROPIC = "claude-haiku-4-5-20251001";
export const MODELO_AVANCADO_ANTHROPIC = "claude-sonnet-4-6";

/**
 * O bloco de tools ganha `cache_control` no ULTIMO item, e o system também.
 *
 * O cache da Anthropic é por prefixo: marcar o fim do bloco faz o system inteiro
 * mais todas as ferramentas entrarem no mesmo prefixo cacheado. Num agente com
 * dezenas de tools isso é a diferença entre reenviar o catálogo inteiro a cada
 * turno e reenviar nada.
 */
function comCache(tools: readonly ToolDoTurno[]): Anthropic.Tool[] {
  return tools.map((t, i, arr) => {
    const base = {
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool["input_schema"],
    };
    return i === arr.length - 1
      ? { ...base, cache_control: { type: "ephemeral" as const } }
      : base;
  });
}

export async function responderAnthropic(
  pergunta: string,
  opcoes: OpcoesResponder,
): Promise<RespostaAgente> {
  const apiKey = opcoes.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Chave da Anthropic não configurada.");

  // Timeout POR REQUISIÇÃO, abaixo do orçamento do turno inteiro: sem teto, uma
  // única chamada lenta consome o orçamento e o cliente recebe o erro genérico.
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_IA_MS, maxRetries: 1 });
  const modelo = opcoes.modelo ?? MODELO_PADRAO_ANTHROPIC;
  const maxIteracoes = opcoes.maxIteracoes ?? 8;
  const maxTokens = opcoes.maxTokens ?? 1500;
  const fim = opcoes.orcamentoMs ? Date.now() + opcoes.orcamentoMs : null;

  const tools = comCache(opcoes.tools ?? []);

  const contentAtual: Anthropic.ContentBlockParam[] = [{ type: "text", text: pergunta }];
  for (const a of opcoes.anexos ?? []) {
    if (a.mime.startsWith("image/")) {
      contentAtual.push({
        type: "image",
        source: {
          type: "base64",
          media_type: a.mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: a.dataBase64,
        },
      });
    } else if (a.mime === "application/pdf") {
      contentAtual.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: a.dataBase64 },
      });
    }
  }

  const messages: Anthropic.MessageParam[] = [
    ...(opcoes.historico ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: (opcoes.anexos?.length ?? 0) > 0 ? contentAtual : pergunta },
  ];

  const toolsUsadas: { nome: string; input: unknown }[] = [];
  const avisos: string[] = [];
  const uso = { entrada: 0, saida: 0 };

  for (let i = 0; i < maxIteracoes; i++) {
    // O orçamento é conferido ANTES de gastar a chamada: estourar no meio do
    // laço deixa o turno sem resposta e sem erro, que é o pior desfecho.
    if (fim && Date.now() >= fim) break;

    const resp = await client.messages.create({
      model: modelo,
      max_tokens: maxTokens,
      ...(opcoes.sistema
        ? {
            system: [
              { type: "text" as const, text: opcoes.sistema, cache_control: { type: "ephemeral" as const } },
            ],
          }
        : {}),
      ...(tools.length ? { tools } : {}),
      messages,
    });

    uso.entrada += resp.usage?.input_tokens ?? 0;
    uso.saida += resp.usage?.output_tokens ?? 0;
    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason !== "tool_use") {
      const texto = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { texto, toolsUsadas, modelo, provedor: "anthropic", uso, avisos };
    }

    if (!opcoes.executarTool) {
      // O modelo pediu ferramenta e ninguém sabe executá-la. Erro alto: seguir
      // devolveria ao cliente uma resposta montada sem o dado que ela promete.
      throw new Error("O modelo pediu uma ferramenta, mas `executarTool` não foi fornecida.");
    }

    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const bloco of resp.content) {
      if (bloco.type !== "tool_use") continue;
      toolsUsadas.push({ nome: bloco.name, input: bloco.input });
      // `executarTool` devolve o resultado JÁ empacotado por
      // `empacotarResultadoTool` — a moldura anti-injection é responsabilidade
      // de quem executa, não de cada adapter (senão um deles esquece).
      const conteudo = await opcoes.executarTool(bloco.name, bloco.input);
      resultados.push({ type: "tool_result", tool_use_id: bloco.id, content: conteudo });
    }
    messages.push({ role: "user", content: resultados });
  }

  return {
    texto:
      "Não consegui concluir o atendimento agora. Vou chamar alguém da equipe para continuar com você.",
    toolsUsadas,
    modelo,
    provedor: "anthropic",
    uso,
    avisos,
  };
}
