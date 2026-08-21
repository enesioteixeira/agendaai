import { describe, expect, it } from "vitest";

import { LEASE_ENVIO_MS, envioExpirou } from "./lease";

const base = new Date("2026-08-21T12:00:00.000Z");
const depoisDe = (ms: number): Date => new Date(base.getTime() + ms);

describe("reserva de envio", () => {
  it("não declara órfã uma reserva recém-feita", () => {
    expect(envioExpirou(base, base)).toBe(false);
    expect(envioExpirou(base, depoisDe(1_000))).toBe(false);
  });

  /**
   * O pior envio legítimo espera 0s + 2s + 8s entre as três tentativas, mais o
   * tempo dos envios em si. Se o teto fosse curto, o varredor marcaria `falhou`
   * uma mensagem que ainda está saindo — e o atendente reenviaria uma que já
   * tinha ido.
   */
  it("cobre com folga o pior reenvio legítimo", () => {
    const piorEspera = 0 + 2_000 + 8_000;
    expect(LEASE_ENVIO_MS).toBeGreaterThan(piorEspera * 4);
    expect(envioExpirou(base, depoisDe(piorEspera))).toBe(false);
  });

  it("declara órfã quando o teto é atingido", () => {
    expect(envioExpirou(base, depoisDe(LEASE_ENVIO_MS))).toBe(true);
    expect(envioExpirou(base, depoisDe(LEASE_ENVIO_MS + 1))).toBe(true);
  });

  /**
   * Linha escrita antes da migration não tem carimbo. Deixá-la presa em
   * `enviando` para sempre é o pior desfecho: ninguém a vê e ninguém a reenvia.
   */
  it("trata reserva sem carimbo como estourada", () => {
    expect(envioExpirou(null, base)).toBe(true);
    expect(envioExpirou(undefined, base)).toBe(true);
  });

  it("aceita teto próprio, para o varredor poder ser testado sem esperar", () => {
    expect(envioExpirou(base, depoisDe(50), 100)).toBe(false);
    expect(envioExpirou(base, depoisDe(100), 100)).toBe(true);
  });
});
