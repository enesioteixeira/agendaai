import { describe, it, expect } from "vitest";
import {
  paraUtc,
  horaNoFuso,
  dataNoFuso,
  adicionarMinutos,
  adicionarDias,
  diaDaSemana,
  linhasDaGrade,
} from "./tempo.js";

describe("tempo (fuso da unidade ⇄ UTC)", () => {
  it("paraUtc converte horário de parede de São Paulo (UTC-3) para instante UTC", () => {
    const d = paraUtc("2026-07-16", "09:00", "America/Sao_Paulo");
    expect(d.toISOString()).toBe("2026-07-16T12:00:00.000Z");
  });

  it("paraUtc respeita outros fusos", () => {
    expect(paraUtc("2026-07-16", "09:00", "UTC").toISOString()).toBe("2026-07-16T09:00:00.000Z");
    // Manaus é UTC-4
    expect(paraUtc("2026-07-16", "09:00", "America/Manaus").toISOString()).toBe(
      "2026-07-16T13:00:00.000Z",
    );
  });

  it("horaNoFuso e dataNoFuso são o inverso da apresentação", () => {
    const instante = new Date("2026-07-16T12:30:00.000Z");
    expect(horaNoFuso(instante, "America/Sao_Paulo")).toBe("09:30");
    expect(dataNoFuso(instante, "America/Sao_Paulo")).toBe("2026-07-16");
    // meia-noite UTC cai no dia anterior em SP
    expect(dataNoFuso(new Date("2026-07-16T01:00:00.000Z"), "America/Sao_Paulo")).toBe(
      "2026-07-15",
    );
  });

  it("aritmética de calendário", () => {
    expect(adicionarMinutos(new Date("2026-07-16T12:00:00Z"), 90).toISOString()).toBe(
      "2026-07-16T13:30:00.000Z",
    );
    expect(adicionarDias("2026-07-31", 1)).toBe("2026-08-01");
    expect(adicionarDias("2026-07-16", -20)).toBe("2026-06-26");
    expect(diaDaSemana("2026-07-16")).toBe(4); // quinta-feira
  });

  it("linhasDaGrade gera slots de 30 min", () => {
    const linhas = linhasDaGrade(7, 21, 30);
    expect(linhas[0]).toBe("07:00");
    expect(linhas.at(-1)).toBe("20:30");
    expect(linhas).toHaveLength(28);
  });
});
