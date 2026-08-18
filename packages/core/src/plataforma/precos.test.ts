import { describe, expect, it } from "vitest";

import {
  COTACAO_DE_REFERENCIA,
  PRECO_DE_MODELO_DESCONHECIDO,
  PRECO_POR_MODELO,
  chaveDoPreco,
  custoDaExecucaoCentavos,
  custoDaExecucaoCentavosExato,
  precoDoModelo,
} from "./precos";

describe("tabela de preço", () => {
  /**
   * Catraca de procedência, não de valor: o número pode mudar a cada revisão
   * trimestral (doc 01 §6), mas a data e a ressalva não podem sumir. Sem elas o
   * painel mostraria "R$ 3,71" com cara de valor apurado, e alguém fecharia
   * contrato em cima de uma estimativa.
   */
  it("carrega a cotação de referência com data e ressalva", () => {
    expect(COTACAO_DE_REFERENCIA).toContain("2026-08-17");
    expect(COTACAO_DE_REFERENCIA).toMatch(/refer[êe]ncia/i);
    expect(COTACAO_DE_REFERENCIA).toMatch(/fatura/i);
  });

  it("é indexada por provedor:modelo normalizado", () => {
    expect(chaveDoPreco("  Anthropic ", "Claude-Haiku-4-5")).toBe("anthropic:claude-haiku-4-5");
    expect(precoDoModelo("ANTHROPIC", "claude-haiku-4-5")).toBe(
      PRECO_POR_MODELO["anthropic:claude-haiku-4-5"],
    );
  });

  /**
   * A saída custa mais que a entrada em todos os provedores, e é isso que faz
   * "resposta curta" ser decisão de custo, não de estilo. Se alguém inverter os
   * dois campos ao acrescentar um modelo, o erro passaria despercebido — a conta
   * continua fechando, só que com o número errado.
   */
  it("mantém saída mais cara que entrada em toda a tabela", () => {
    for (const [chave, preco] of Object.entries(PRECO_POR_MODELO)) {
      expect(preco.saidaPorMilhaoCentavos, chave).toBeGreaterThan(preco.entradaPorMilhaoCentavos);
      expect(preco.entradaPorMilhaoCentavos, chave).toBeGreaterThan(0);
    }
  });
});

describe("custo da execução", () => {
  it("calcula pela proporção do milhão de tokens", () => {
    // 1.000.000 de entrada = exatamente o preço de um milhão.
    const uso = { entrada: 1_000_000, saida: 1_000_000 };
    expect(custoDaExecucaoCentavosExato(uso, "anthropic", "claude-haiku-4-5")).toBe(550 + 2750);
  });

  /**
   * O motivo de `custoDaExecucaoCentavosExato` existir. Um turno típico do
   * Gemini Flash custa fração de centavo: arredondando execução a execução, mil
   * turnos somariam ZERO, e o custo de IA — o motivo do teto — sumiria da
   * apuração inteira.
   */
  it("preserva a fração de centavo que o arredondamento por linha jogaria fora", () => {
    const turno = { entrada: 1_000, saida: 300 };
    expect(custoDaExecucaoCentavos(turno, "gemini", "gemini-2.5-flash")).toBe(1);

    const exato = custoDaExecucaoCentavosExato(turno, "gemini", "gemini-2.5-flash");
    expect(exato).toBeCloseTo(0.5775, 6);

    const mil = Array.from({ length: 1_000 }, () => exato).reduce((a, b) => a + b, 0);
    expect(Math.round(mil)).toBe(577); // R$ 5,77 — não R$ 0,00 (linha a linha) nem R$ 10,00 (teto)
  });

  /**
   * Modelo fora da tabela NÃO pode custar zero: zero é IA de graça e teto que
   * nunca fecha. Erra-se para cima de propósito — o teto degrada mais cedo e a
   * distorção aparece no painel, em vez de na fatura do provedor.
   */
  it("cobra o preço mais caro conhecido quando o modelo não está na tabela", () => {
    const uso = { entrada: 1_000_000, saida: 1_000_000 };
    expect(precoDoModelo("openai", "modelo-que-ninguem-homologou")).toBe(
      PRECO_DE_MODELO_DESCONHECIDO,
    );
    expect(custoDaExecucaoCentavos(uso, "openai", "modelo-que-ninguem-homologou")).toBe(
      PRECO_DE_MODELO_DESCONHECIDO.entradaPorMilhaoCentavos +
        PRECO_DE_MODELO_DESCONHECIDO.saidaPorMilhaoCentavos,
    );
  });

  /**
   * Contagem de token vem de SDK de terceiro. Um `-1` ou um `undefined` que
   * escapou da tipagem não pode virar crédito na fatura — o pior desfecho
   * possível é a plataforma dever dinheiro por causa de um campo ausente.
   */
  it("ignora contagem de token inválida em vez de gerar crédito", () => {
    expect(custoDaExecucaoCentavos({ entrada: -1_000_000, saida: 0 }, "anthropic", "claude-opus-5")).toBe(0);
    expect(
      custoDaExecucaoCentavosExato(
        { entrada: Number.NaN, saida: 1_000_000 },
        "anthropic",
        "claude-haiku-4-5",
      ),
    ).toBe(2750);
  });
});
