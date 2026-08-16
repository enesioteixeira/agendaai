import { describe, expect, it } from "vitest";

import { MAX_TENTATIVAS, deveTentarDeNovo, ehTransitorio, esperaDaTentativa } from "./reenvio";

describe("classificação do erro", () => {
  it("trata falha de rede como transitória", () => {
    for (const msg of ["socket hang up", "ETIMEDOUT", "fetch failed", "Timed out"]) {
      expect(ehTransitorio(new Error(msg)), msg).toBe(true);
    }
  });

  /**
   * Repetir uma recusa definitiva não melhora nada: só atrasa o `falhou` que o
   * atendente precisa ver para tomar outra atitude (ligar, usar outro número).
   */
  it("não insiste em recusa definitiva", () => {
    for (const msg of [
      "not-authorized",
      "Forbidden",
      "invalid jid",
      "number is not on whatsapp",
      "Connection Closed",
    ]) {
      expect(ehTransitorio(new Error(msg)), msg).toBe(false);
    }
  });

  it("na dúvida, tenta de novo — errar por insistir custa 2s, errar por desistir custa a mensagem", () => {
    expect(ehTransitorio(new Error("erro estranho que ninguém previu"))).toBe(true);
    expect(ehTransitorio("string solta")).toBe(true);
    expect(ehTransitorio(undefined)).toBe(true);
  });
});

describe("política de tentativas", () => {
  it("cresce a espera entre tentativas e não dorme antes da primeira", () => {
    expect(esperaDaTentativa(0)).toBe(0);
    expect(esperaDaTentativa(1)).toBeGreaterThan(0);
    expect(esperaDaTentativa(2)).toBeGreaterThan(esperaDaTentativa(1));
  });

  it("nunca estoura o array de esperas", () => {
    expect(esperaDaTentativa(99)).toBe(esperaDaTentativa(MAX_TENTATIVAS - 1));
  });

  it("para na última tentativa", () => {
    const transitorio = new Error("socket hang up");
    expect(deveTentarDeNovo(0, transitorio)).toBe(true);
    expect(deveTentarDeNovo(MAX_TENTATIVAS - 1, transitorio)).toBe(false);
  });

  it("nem tenta de novo quando o erro é definitivo", () => {
    expect(deveTentarDeNovo(0, new Error("not-authorized"))).toBe(false);
  });

  /**
   * As esperas somadas são o tempo máximo que o cliente do outro lado fica sem
   * resposta. Reenvio que demora meio minuto é pior que falhar rápido e deixar
   * o atendente reenviar sabendo.
   */
  it("mantém o pior caso abaixo de 15 segundos", () => {
    const total = Array.from({ length: MAX_TENTATIVAS }, (_, i) => esperaDaTentativa(i)).reduce(
      (a, b) => a + b,
      0,
    );
    expect(total).toBeLessThan(15_000);
  });
});
