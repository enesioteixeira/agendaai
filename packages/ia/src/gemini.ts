// Adapter Google Gemini — laco de function calling.
// Port de `ev-tracker/src/lib/esteira/provedores/gemini.ts`.
//
// O formato do Gemini e parecido com o JSON Schema da Anthropic, mas o laco de
// mensagens e outro: user -> model (functionCall) -> user (functionResponse).

import { GoogleGenAI, Type } from "@google/genai";
import type { Content, FunctionDeclaration, Part } from "@google/genai";
import type { OpcoesResponder, RespostaAgente, ToolDoTurno } from "@atende/core";

import { TIMEOUT_IA_MS } from "./http";

export const MODELO_PADRAO_GEMINI = "gemini-2.5-flash";
export const MODELO_AVANCADO_GEMINI = "gemini-2.5-pro";

interface SchemaLike {
  type?: string;
  properties?: Record<string, SchemaLike>;
  required?: readonly string[];
  items?: SchemaLike;
  enum?: readonly string[];
  description?: string;
}

/**
 * JSON Schema (formato canônico, o da Anthropic) → schema do Gemini.
 *
 * ⚠️ O detalhe que derruba a conversa: **o Gemini rejeita com 400 um OBJECT que
 * traga `properties` vazio** — e o 400 mata a requisição inteira, não só aquela
 * ferramenta. Uma tool sem argumentos, escrita da forma óbvia
 * (`{ type: "object", properties: {} }`), tira o agente do ar por completo.
 *
 * Por isso `properties` só é emitido quando existe ao menos uma. O mesmo cuidado
 * se repete em `paraFunctionDeclarations`, para o `parameters` do topo.
 */
function converterSchema(s: Record<string, unknown>): Record<string, unknown> {
  const src = s as SchemaLike;
  const out: Record<string, unknown> = {};

  switch (src.type) {
    case "object": {
      out.type = Type.OBJECT;
      if (src.properties && Object.keys(src.properties).length > 0) {
        const props: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(src.properties)) {
          props[k] = converterSchema(v as unknown as Record<string, unknown>);
        }
        out.properties = props;
      }
      if (src.required && src.required.length > 0) out.required = [...src.required];
      break;
    }
    case "array":
      out.type = Type.ARRAY;
      if (src.items) out.items = converterSchema(src.items as unknown as Record<string, unknown>);
      break;
    case "string":
      out.type = Type.STRING;
      if (src.enum) out.enum = [...src.enum];
      break;
    case "number":
    case "integer":
      out.type = Type.NUMBER;
      break;
    case "boolean":
      out.type = Type.BOOLEAN;
      break;
    default:
      out.type = Type.OBJECT;
  }

  if (src.description) out.description = src.description;
  return out;
}

export function paraFunctionDeclarations(
  tools: readonly ToolDoTurno[],
): FunctionDeclaration[] {
  return tools.map((t) => {
    const params = converterSchema(t.input_schema as unknown as Record<string, unknown>);
    const props = params.properties as Record<string, unknown> | undefined;
    // Ferramenta sem argumento omite `parameters` inteiro — ver o aviso acima.
    const semArgs = !props || Object.keys(props).length === 0;
    return {
      name: t.name,
      description: t.description,
      parameters: semArgs ? undefined : (params as FunctionDeclaration["parameters"]),
    };
  });
}

export async function responderGemini(
  pergunta: string,
  opcoes: OpcoesResponder,
): Promise<RespostaAgente> {
  const apiKey = opcoes.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Chave do Gemini não configurada.");

  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: TIMEOUT_IA_MS } });
  const modelo = opcoes.modelo ?? MODELO_PADRAO_GEMINI;
  const maxIteracoes = opcoes.maxIteracoes ?? 8;
  const maxTokens = opcoes.maxTokens ?? 1500;
  const fim = opcoes.orcamentoMs ? Date.now() + opcoes.orcamentoMs : null;

  const declaracoes = paraFunctionDeclarations(opcoes.tools ?? []);

  const contents: Content[] = [
    ...(opcoes.historico ?? []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }] as Part[],
    })),
    { role: "user", parts: [{ text: pergunta }] },
  ];

  const toolsUsadas: { nome: string; input: unknown }[] = [];
  const avisos: string[] = [];
  const uso = { entrada: 0, saida: 0 };

  /**
   * O Gemini 2.5 "pensa" por padrão, e os tokens de raciocínio contam dentro de
   * `maxOutputTokens`. Com teto baixo a resposta voltava VAZIA — `finishReason:
   * MAX_TOKENS`, sem nenhuma parte de texto —, o que parece falha do adapter e
   * é só orçamento. O budget é somado ao teto pedido, não descontado dele.
   */
  const thinkingBudget = 1024;

  for (let i = 0; i < maxIteracoes; i++) {
    if (fim && Date.now() >= fim) break;

    const resp = await client.models.generateContent({
      model: modelo,
      contents,
      config: {
        ...(opcoes.sistema ? { systemInstruction: opcoes.sistema } : {}),
        ...(declaracoes.length ? { tools: [{ functionDeclarations: declaracoes }] } : {}),
        maxOutputTokens: maxTokens + thinkingBudget,
        thinkingConfig: { thinkingBudget, includeThoughts: false },
      },
    });

    uso.entrada += resp.usageMetadata?.promptTokenCount ?? 0;
    uso.saida += resp.usageMetadata?.candidatesTokenCount ?? 0;

    const partes = resp.candidates?.[0]?.content?.parts ?? [];
    const chamadas = partes.filter((p) => p.functionCall);

    if (chamadas.length === 0) {
      const texto = partes
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      if (!texto && resp.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        // Mensagem acionável em vez de resposta vazia: quem lê o log precisa
        // saber que o teto de tokens é a causa, não o modelo ou a rede.
        throw new Error(
          "Gemini atingiu MAX_TOKENS sem produzir texto — aumente maxTokens (o raciocínio consome o mesmo teto).",
        );
      }
      return { texto, toolsUsadas, modelo, provedor: "gemini", uso, avisos };
    }

    if (!opcoes.executarTool) {
      throw new Error("O modelo pediu uma ferramenta, mas `executarTool` não foi fornecida.");
    }

    contents.push({ role: "model", parts: partes });
    const respostas: Part[] = [];
    for (const p of chamadas) {
      const chamada = p.functionCall!;
      const nome = chamada.name ?? "";
      toolsUsadas.push({ nome, input: chamada.args });
      const conteudo = await opcoes.executarTool(nome, chamada.args);
      respostas.push({ functionResponse: { name: nome, response: { resultado: conteudo } } });
    }
    contents.push({ role: "user", parts: respostas });
  }

  return {
    texto:
      "Não consegui concluir o atendimento agora. Vou chamar alguém da equipe para continuar com você.",
    toolsUsadas,
    modelo,
    provedor: "gemini",
    uso,
    avisos,
  };
}
