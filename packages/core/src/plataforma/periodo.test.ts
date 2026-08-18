import { describe, expect, it } from "vitest";

import { mesReferencia, mesSeguinte } from "./periodo";

describe("mesReferencia", () => {
  it("devolve ano-mês com dois dígitos no mês", () => {
    expect(mesReferencia(new Date("2026-08-17T14:32:00Z"))).toBe("2026-08");
    expect(mesReferencia(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });

  /**
   * A virada de mês é o teste que importa, porque é o único instante em que a
   * escolha do fuso muda o resultado. 23h59 do dia 31 em Brasília já é o mês
   * seguinte em UTC — e é assim que tem que ser: o mesmo consumo precisa cair no
   * mesmo mês para a plataforma inteira, senão a apuração depende de onde o
   * tenant está.
   */
  it("agrega por UTC, não pelo fuso de quem usou", () => {
    expect(mesReferencia(new Date("2026-08-31T23:59:59-03:00"))).toBe("2026-09");
    expect(mesReferencia(new Date("2026-09-01T00:30:00Z"))).toBe("2026-09");
  });

  /**
   * `mesReferencia` é chave de `UsoMensal` (`@@unique([empresaId, mesReferencia])`).
   * Uma data inválida viraria a string "NaN-NaN" sem erro nenhum: uma linha de
   * consumo que ninguém encontra e que nenhuma fatura fecha.
   */
  it("estoura em data inválida em vez de gerar uma chave impossível", () => {
    expect(() => mesReferencia(new Date("não é data"))).toThrow(/inválida/);
  });
});

describe("mesSeguinte", () => {
  /** O excedente é cobrado no ciclo seguinte (doc 06 §1). */
  it("avança um mês", () => {
    expect(mesSeguinte("2026-08")).toBe("2026-09");
    expect(mesSeguinte("2026-01")).toBe("2026-02");
  });

  /** A virada de ano é exatamente a aritmética que ninguém testa à mão. */
  it("vira o ano em dezembro", () => {
    expect(mesSeguinte("2026-12")).toBe("2027-01");
  });

  it("recusa mês fora do formato", () => {
    expect(() => mesSeguinte("2026-13")).toThrow();
    expect(() => mesSeguinte("2026-8")).toThrow();
    expect(() => mesSeguinte("agosto")).toThrow();
  });
});
