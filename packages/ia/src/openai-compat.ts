// Adapter unico para OpenAI e xAI (Grok) — os dois falam Chat Completions.
// Port de `ev-tracker/src/lib/esteira/provedores/openai-compat.ts`.
//
// Sao dois provedores num arquivo so porque a diferenca cabe em tres campos:
// baseURL, o nome do parametro de teto de tokens e a variavel de ambiente da
// chave. Manter dois arquivos quase iguais e garantir que um receba correcao
// que o outro nao recebe.

import OpenAI from "openai";
import type { OpcoesResponder, RespostaAgente, ToolDoTurno } from "@atende/core";

import { TIMEOUT_IA_MS } from "./http";

export const MODELO_PADRAO_OPENAI = "gpt-4o-mini";
export const MODELO_AVANCADO_OPENAI = "gpt-4o";
export const MODELO_PADRAO_GROK = "grok-3-mini";
export const MODELO_AVANCADO_GROK = "grok-3";

interface CompatCfg {
  readonly provedor: "openai" | "grok";
  readonly baseURL?: string;
  /** OpenAI usa `max_completion_tokens`; a API do Grok ainda espera `max_tokens`. */
  readonly tokenParam: "max_completion_tokens" | "max_tokens";
  readonly envs: readonly string[];
  readonly modeloPadrao: string;
}

const OPENAI: CompatCfg = {
  provedor: "openai",
  tokenParam: "max_completion_tokens",
  envs: ["OPENAI_API_KEY"],
  modeloPadrao: MODELO_PADRAO_OPENAI,
};

const GROK: CompatCfg = {
  provedor: "grok",
  baseURL: "https://api.x.ai/v1",
  tokenParam: "max_tokens",
  envs: ["XAI_API_KEY", "GROK_API_KEY"],
  modeloPadrao: MODELO_PADRAO_GROK,
};

function paraTools(tools: readonly ToolDoTurno[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

async function responderCompat(
  cfg: CompatCfg,
  pergunta: string,
  opcoes: OpcoesResponder,
): Promise<RespostaAgente> {
  const apiKey = opcoes.apiKey ?? cfg.envs.map((e) => process.env[e]).find(Boolean);
  if (!apiKey) throw new Error(`Chave do ${cfg.provedor} não configurada.`);

  const client = new OpenAI({
    apiKey,
    ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
    timeout: TIMEOUT_IA_MS,
    maxRetries: 1,
  });

  const modelo = opcoes.modelo ?? cfg.modeloPadrao;
  const maxIteracoes = opcoes.maxIteracoes ?? 8;
  const maxTokens = opcoes.maxTokens ?? 1500;
  const fim = opcoes.orcamentoMs ? Date.now() + opcoes.orcamentoMs : null;
  const tools = paraTools(opcoes.tools ?? []);

  // Anexo de imagem vira data URL; PDF não existe em chat completions e é
  // descartado com aviso — melhor dizer que o arquivo não foi lido do que
  // deixar o modelo responder como se tivesse lido.
  const avisos: string[] = [];
  const partes: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: pergunta },
  ];
  for (const a of opcoes.anexos ?? []) {
    if (a.mime.startsWith("image/")) {
      partes.push({ type: "image_url", image_url: { url: `data:${a.mime};base64,${a.dataBase64}` } });
    } else {
      avisos.push(`O arquivo ${a.nome ?? "enviado"} não pôde ser lido por este provedor.`);
    }
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...(opcoes.sistema ? [{ role: "system" as const, content: opcoes.sistema }] : []),
    ...(opcoes.historico ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: partes.length > 1 ? partes : pergunta },
  ];

  const toolsUsadas: { nome: string; input: unknown }[] = [];
  const uso = { entrada: 0, saida: 0 };

  for (let i = 0; i < maxIteracoes; i++) {
    if (fim && Date.now() >= fim) break;

    const resp = await client.chat.completions.create({
      model: modelo,
      messages,
      ...(tools.length ? { tools } : {}),
      [cfg.tokenParam]: maxTokens,
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);

    uso.entrada += resp.usage?.prompt_tokens ?? 0;
    uso.saida += resp.usage?.completion_tokens ?? 0;

    const escolha = resp.choices[0]?.message;
    if (!escolha) break;
    messages.push(escolha);

    const chamadas = escolha.tool_calls ?? [];
    if (chamadas.length === 0) {
      return {
        texto: (escolha.content ?? "").trim(),
        toolsUsadas,
        modelo,
        provedor: cfg.provedor,
        uso,
        avisos,
      };
    }

    if (!opcoes.executarTool) {
      throw new Error("O modelo pediu uma ferramenta, mas `executarTool` não foi fornecida.");
    }

    for (const c of chamadas) {
      if (c.type !== "function") continue;
      // Argumento vem como STRING de JSON, e o modelo às vezes manda JSON
      // inválido. Falhar o turno inteiro por isso seria trocar um argumento
      // ruim por nenhuma resposta — o erro vai para o modelo, que corrige.
      let input: unknown = {};
      try {
        input = JSON.parse(c.function.arguments || "{}");
      } catch {
        input = {};
        avisos.push(`Argumentos inválidos na chamada de ${c.function.name}.`);
      }
      toolsUsadas.push({ nome: c.function.name, input });
      const conteudo = await opcoes.executarTool(c.function.name, input);
      messages.push({ role: "tool", tool_call_id: c.id, content: conteudo });
    }
  }

  return {
    texto:
      "Não consegui concluir o atendimento agora. Vou chamar alguém da equipe para continuar com você.",
    toolsUsadas,
    modelo,
    provedor: cfg.provedor,
    uso,
    avisos,
  };
}

export const responderOpenAI = (p: string, o: OpcoesResponder): Promise<RespostaAgente> =>
  responderCompat(OPENAI, p, o);

export const responderGrok = (p: string, o: OpcoesResponder): Promise<RespostaAgente> =>
  responderCompat(GROK, p, o);
