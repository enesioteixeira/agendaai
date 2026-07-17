import { describe, it, expect } from "vitest";
import { slotsLivres } from "./disponibilidade";
import { paraUtc } from "./tempo";

const FUSO = "America/Sao_Paulo";
// 2026-07-16 é quinta-feira (diaSemana 4)
const DATA = "2026-07-16";
const ANTES = new Date("2026-07-01T00:00:00Z"); // "agora" bem antes do dia

const gradeQuinta = [{ diaSemana: 4, horaInicio: "09:00", horaFim: "12:00" }];

describe("slotsLivres (booking)", () => {
  it("oferece a grade inteira quando não há ocupação (serviço cabe até o fim)", () => {
    const slots = slotsLivres({
      data: DATA,
      fuso: FUSO,
      duracaoMin: 60,
      gradeTrabalho: gradeQuinta,
      funcionamento: [],
      ocupados: [],
      bloqueios: [],
      agora: ANTES,
    });
    // 09:00–12:00, passo 30, serviço 60min → último início possível 11:00
    expect(slots).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("remove slots que colidem com agendamento existente", () => {
    const slots = slotsLivres({
      data: DATA,
      fuso: FUSO,
      duracaoMin: 60,
      gradeTrabalho: gradeQuinta,
      funcionamento: [],
      ocupados: [
        { inicio: paraUtc(DATA, "10:00", FUSO), fim: paraUtc(DATA, "11:00", FUSO) },
      ],
      bloqueios: [],
      agora: ANTES,
    });
    // 09:30 colide (09:30–10:30 × 10:00), 10:00/10:30 colidem; sobram 09:00 e 11:00
    expect(slots).toEqual(["09:00", "11:00"]);
  });

  it("funcionamento da unidade restringe; bloqueio corta; dia sem grade = vazio", () => {
    const comFuncionamento = slotsLivres({
      data: DATA,
      fuso: FUSO,
      duracaoMin: 30,
      gradeTrabalho: gradeQuinta,
      funcionamento: [{ diaSemana: 4, horaInicio: "10:00", horaFim: "11:00" }],
      ocupados: [],
      bloqueios: [],
      agora: ANTES,
    });
    expect(comFuncionamento).toEqual(["10:00", "10:30"]);

    const comBloqueio = slotsLivres({
      data: DATA,
      fuso: FUSO,
      duracaoMin: 30,
      gradeTrabalho: gradeQuinta,
      funcionamento: [],
      ocupados: [],
      bloqueios: [{ inicio: paraUtc(DATA, "09:00", FUSO), fim: paraUtc(DATA, "11:30", FUSO) }],
      agora: ANTES,
    });
    expect(comBloqueio).toEqual(["11:30"]);

    const domingo = slotsLivres({
      data: "2026-07-19", // domingo
      fuso: FUSO,
      duracaoMin: 30,
      gradeTrabalho: gradeQuinta,
      funcionamento: [],
      ocupados: [],
      bloqueios: [],
      agora: ANTES,
    });
    expect(domingo).toEqual([]);
  });

  it("não oferece horário no passado", () => {
    const slots = slotsLivres({
      data: DATA,
      fuso: FUSO,
      duracaoMin: 30,
      gradeTrabalho: gradeQuinta,
      funcionamento: [],
      ocupados: [],
      bloqueios: [],
      // "agora" = 10:15 do próprio dia em SP → só sobram slots a partir de 10:30
      agora: paraUtc(DATA, "10:15", FUSO),
    });
    expect(slots).toEqual(["10:30", "11:00", "11:30"]);
  });
});
