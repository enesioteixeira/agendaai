import type { ToolDoTurno } from "@atende/core";
import { describe, expect, it } from "vitest";

import { paraFunctionDeclarations } from "./gemini";

/**
 * CATRACA DO 400 DO GEMINI.
 *
 * Equivalente ao `tools-schema.test.ts` do ev-tracker, e pelo mesmo motivo: o
 * Gemini rejeita com 400 uma ferramenta cujo OBJECT traga `properties` vazio, e
 * o 400 **derruba a requisição inteira** — não a ferramenta, a conversa. O
 * agente sai do ar por completo.
 *
 * Nada mais pega isso. TypeScript não pega (o schema é válido), o build não
 * pega, e um teste de unidade da tool também não: só a conversão para o formato
 * do Gemini revela o problema. No ev-tracker o defeito derrubou o chat e a
 * análise ao mesmo tempo, por causa de uma única tool sem argumentos.
 */

const semArgumentos: ToolDoTurno = {
  name: "listarPedidosAbertos",
  description: "Lista os pedidos em aberto do cliente da conversa.",
  input_schema: { type: "object", properties: {} }, // a forma que mata
};

const comArgumentos: ToolDoTurno = {
  name: "buscarCatalogo",
  description: "Busca itens no catálogo do tenant.",
  input_schema: {
    type: "object",
    properties: {
      termo: { type: "string", description: "Texto buscado" },
      limite: { type: "integer" },
    },
    required: ["termo"],
  },
};

const comObjetoAninhadoVazio: ToolDoTurno = {
  name: "montarPedido",
  description: "Monta um pedido a partir de itens.",
  input_schema: {
    type: "object",
    properties: {
      itens: {
        type: "array",
        items: { type: "object", properties: {} }, // vazio LÁ DENTRO
      },
    },
  },
};

/** Varre o schema convertido procurando a forma proibida em qualquer nível. */
function temObjetoComPropriedadesVazias(no: unknown): boolean {
  if (!no || typeof no !== "object") return false;
  const o = no as Record<string, unknown>;
  if ("properties" in o && o.properties && Object.keys(o.properties).length === 0) return true;
  return Object.values(o).some((v) =>
    Array.isArray(v) ? v.some(temObjetoComPropriedadesVazias) : temObjetoComPropriedadesVazias(v),
  );
}

describe("o detector da catraca", () => {
  /**
   * Uma catraca que não detecta nada passa sempre — e passar sempre é
   * indistinguível de estar funcionando. Este teste prova que o detector
   * enxerga a forma proibida, inclusive aninhada, antes de a suíte confiar nele.
   */
  it("reconhece a forma proibida na raiz e aninhada", () => {
    expect(temObjetoComPropriedadesVazias({ type: "OBJECT", properties: {} })).toBe(true);
    expect(
      temObjetoComPropriedadesVazias({
        type: "OBJECT",
        properties: { itens: { type: "ARRAY", items: { type: "OBJECT", properties: {} } } },
      }),
    ).toBe(true);
    expect(temObjetoComPropriedadesVazias([{ parameters: { properties: {} } }])).toBe(true);
  });

  it("não acusa schema saudável", () => {
    expect(
      temObjetoComPropriedadesVazias({ type: "OBJECT", properties: { a: { type: "STRING" } } }),
    ).toBe(false);
    expect(temObjetoComPropriedadesVazias({ name: "x", parameters: undefined })).toBe(false);
  });
});

describe("conversão de tools para o Gemini", () => {
  it("omite `parameters` inteiro quando a ferramenta não tem argumentos", () => {
    const [decl] = paraFunctionDeclarations([semArgumentos]);
    expect(decl?.name).toBe("listarPedidosAbertos");
    expect(decl?.parameters).toBeUndefined();
  });

  it("preserva os argumentos quando eles existem", () => {
    const [decl] = paraFunctionDeclarations([comArgumentos]);
    const params = decl?.parameters as Record<string, unknown> | undefined;
    expect(Object.keys((params?.properties ?? {}) as object).sort()).toEqual(["limite", "termo"]);
    expect(params?.required).toEqual(["termo"]);
  });

  it("não emite `properties` vazio em NENHUM nível do schema", () => {
    for (const tool of [semArgumentos, comArgumentos, comObjetoAninhadoVazio]) {
      const declaracoes = paraFunctionDeclarations([tool]);
      expect(temObjetoComPropriedadesVazias(declaracoes), tool.name).toBe(false);
    }
  });

  it("converte lista inteira sem perder ferramenta", () => {
    const decls = paraFunctionDeclarations([semArgumentos, comArgumentos, comObjetoAninhadoVazio]);
    expect(decls.map((d) => d.name)).toEqual([
      "listarPedidosAbertos",
      "buscarCatalogo",
      "montarPedido",
    ]);
  });
});
