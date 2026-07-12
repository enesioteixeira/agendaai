import { describe, it, expect } from "vitest";
import { botoesParaListaNumerada, parsearRespostaNumerada } from "./degradacao";

const botoes = [
  { payload: "confirmar", rotulo: "Confirmar" },
  { payload: "alterar", rotulo: "Alterar" },
  { payload: "cancelar", rotulo: "Cancelar" },
];

describe("botoesParaListaNumerada", () => {
  it("gera lista numerada com instrução e mapa numero->payload", () => {
    const { texto, mapa } = botoesParaListaNumerada("Seu horário é amanhã às 10h.", botoes);
    expect(texto).toContain("1 - Confirmar");
    expect(texto).toContain("3 - Cancelar");
    expect(texto).toContain("Responda com o número da opção.");
    expect(mapa).toEqual({ "1": "confirmar", "2": "alterar", "3": "cancelar" });
  });
});

describe("parsearRespostaNumerada", () => {
  const { mapa } = botoesParaListaNumerada("x", botoes);

  it("aceita variações tolerantes", () => {
    expect(parsearRespostaNumerada("1", mapa)).toBe("confirmar");
    expect(parsearRespostaNumerada("1.", mapa)).toBe("confirmar");
    expect(parsearRespostaNumerada("opção 2", mapa)).toBe("alterar");
    expect(parsearRespostaNumerada("quero a 3", mapa)).toBe("cancelar");
  });

  it("recusa ambiguidade e fora do mapa", () => {
    expect(parsearRespostaNumerada("1 ou 2", mapa)).toBeNull();
    expect(parsearRespostaNumerada("9", mapa)).toBeNull();
    expect(parsearRespostaNumerada("sim", mapa)).toBeNull();
  });

  it("repetição do mesmo número não é ambiguidade", () => {
    expect(parsearRespostaNumerada("1, isso, a 1 mesmo", mapa)).toBe("confirmar");
  });
});
