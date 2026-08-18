import { describe, expect, it } from "vitest";

import {
  avancarNoExpediente,
  dentroDoExpediente,
  lerExpediente,
  proximaAberturaDoExpediente,
} from "./horario";

// 2026-08-16 é domingo, 17 é segunda, 18 é terça, 22 é sábado.
// America/Sao_Paulo está em UTC-3 (o Brasil não tem horário de verão desde 2019),
// então a hora de parede aparece nos instantes abaixo somada de 3 h.
const COMERCIAL = {
  fuso: "America/Sao_Paulo",
  dias: {
    seg: [
      ["08:00", "12:00"],
      ["13:30", "18:00"],
    ],
    ter: [["08:00", "18:00"]],
    qua: [["08:00", "18:00"]],
    qui: [["08:00", "18:00"]],
    sex: [["08:00", "18:00"]],
    sab: [["09:00", "13:00"]],
  },
};

/** Instante UTC de uma hora de parede de São Paulo (UTC-3). */
function emSp(data: string, hhmm: string): Date {
  return new Date(`${data}T${hhmm}:00-03:00`);
}

describe("expediente — configuração ausente ou quebrada é 24 por 7", () => {
  /**
   * `horarioJson` é campo livre preenchido pelo tenant. Uma fila mal configurada
   * não pode derrubar o roteamento das outras — por isso todo caminho de erro
   * termina em "sempre aberta", nunca em exceção e nunca em "sempre fechada"
   * (que faria a conversa nascer sem prazo, em silêncio).
   */
  it("trata ausência, lixo e faixa invertida como sem expediente", () => {
    const semExpediente: unknown[] = [
      null,
      undefined,
      { fuso: "America/Sao_Paulo", dias: {} }, // nenhuma faixa na semana
      { dias: { seg: [] } },
      { fuso: "America/Sao_Paulo", dias: { seg: [["18:00", "08:00"]] } }, // fim antes do início
      { fuso: "America/Sao_Paulo", dias: { seg: [["8h", "18h"]] } }, // hora fora do formato
      { fuso: "Marte/Olympus", dias: { seg: [["08:00", "18:00"]] } }, // fuso inexistente
      "seg a sex das 8 às 18", // nem objeto é
      42,
    ];

    for (const horario of semExpediente) {
      expect(lerExpediente(horario)).toBeNull();
      expect(dentroDoExpediente(emSp("2026-08-16", "03:00"), horario)).toBe(true);
      expect(proximaAberturaDoExpediente(emSp("2026-08-16", "03:00"), horario)).toBeNull();
    }
  });

  it("sem expediente, o prazo corre em tempo corrido", () => {
    const entrada = emSp("2026-08-17", "22:00");
    expect(avancarNoExpediente(entrada, 30, null).toISOString()).toBe(
      emSp("2026-08-17", "22:30").toISOString(),
    );
  });
});

describe("expediente — dentro e fora", () => {
  it("reconhece hora aberta, almoço, madrugada e domingo", () => {
    expect(dentroDoExpediente(emSp("2026-08-17", "10:00"), COMERCIAL)).toBe(true);
    expect(dentroDoExpediente(emSp("2026-08-17", "12:30"), COMERCIAL)).toBe(false); // almoço
    expect(dentroDoExpediente(emSp("2026-08-17", "22:00"), COMERCIAL)).toBe(false);
    expect(dentroDoExpediente(emSp("2026-08-16", "10:00"), COMERCIAL)).toBe(false); // domingo
    expect(dentroDoExpediente(emSp("2026-08-22", "10:00"), COMERCIAL)).toBe(true); // sábado
    expect(dentroDoExpediente(emSp("2026-08-22", "14:00"), COMERCIAL)).toBe(false);
  });

  it("o fechamento é exclusivo: 18:00 em ponto já é fora", () => {
    expect(dentroDoExpediente(emSp("2026-08-18", "17:59"), COMERCIAL)).toBe(true);
    expect(dentroDoExpediente(emSp("2026-08-18", "18:00"), COMERCIAL)).toBe(false);
    expect(dentroDoExpediente(emSp("2026-08-18", "08:00"), COMERCIAL)).toBe(true);
  });

  /**
   * O expediente é do TENANT, não do servidor: o mesmo instante está dentro em
   * São Paulo e fora em Manaus (UTC-4). Se este teste quebrar, o prazo de todo
   * cliente fora do Sudeste está errado por uma hora.
   */
  it("respeita o fuso configurado na fila", () => {
    const manaus = { ...COMERCIAL, fuso: "America/Manaus" };
    const instante = emSp("2026-08-18", "08:00"); // 07:00 em Manaus
    expect(dentroDoExpediente(instante, COMERCIAL)).toBe(true);
    expect(dentroDoExpediente(instante, manaus)).toBe(false);
  });

  it("aceita 24:00 como fim do turno da noite", () => {
    const noturna = { fuso: "America/Sao_Paulo", dias: { seg: [["22:00", "24:00"]] } };
    expect(dentroDoExpediente(emSp("2026-08-17", "23:30"), noturna)).toBe(true);
    expect(dentroDoExpediente(emSp("2026-08-18", "00:30"), noturna)).toBe(false);
  });

  /** Turnos sobrepostos vêm de UI com dois campos; contar o minuto duas vezes esticaria o prazo. */
  it("funde faixas que se sobrepõem", () => {
    const sobreposto = {
      fuso: "America/Sao_Paulo",
      dias: {
        seg: [
          ["08:00", "12:00"],
          ["11:00", "18:00"],
        ],
      },
    };
    expect(lerExpediente(sobreposto)?.dias[1]).toEqual([{ inicioMin: 480, fimMin: 1080 }]);
    expect(dentroDoExpediente(emSp("2026-08-17", "12:30"), sobreposto)).toBe(true);
  });
});

describe("expediente — próxima abertura", () => {
  it("devolve o próprio instante quando a fila já está aberta", () => {
    const agora = emSp("2026-08-17", "10:00");
    expect(proximaAberturaDoExpediente(agora, COMERCIAL)?.toISOString()).toBe(agora.toISOString());
  });

  it("da madrugada, abre no mesmo dia", () => {
    expect(proximaAberturaDoExpediente(emSp("2026-08-18", "03:00"), COMERCIAL)?.toISOString()).toBe(
      emSp("2026-08-18", "08:00").toISOString(),
    );
  });

  it("do almoço, abre no segundo turno", () => {
    expect(proximaAberturaDoExpediente(emSp("2026-08-17", "12:30"), COMERCIAL)?.toISOString()).toBe(
      emSp("2026-08-17", "13:30").toISOString(),
    );
  });

  it("depois do fechamento, abre no dia seguinte", () => {
    expect(proximaAberturaDoExpediente(emSp("2026-08-17", "22:00"), COMERCIAL)?.toISOString()).toBe(
      emSp("2026-08-18", "08:00").toISOString(),
    );
  });

  it("pula o dia fechado inteiro", () => {
    // Sábado à tarde → só segunda, porque domingo não tem faixa nenhuma.
    expect(proximaAberturaDoExpediente(emSp("2026-08-22", "14:00"), COMERCIAL)?.toISOString()).toBe(
      emSp("2026-08-24", "08:00").toISOString(),
    );
  });

  it("acha a abertura mesmo com uma única faixa na semana", () => {
    const soQuarta = { fuso: "America/Sao_Paulo", dias: { qua: [["09:00", "10:00"]] } };
    expect(proximaAberturaDoExpediente(emSp("2026-08-17", "09:30"), soQuarta)?.toISOString()).toBe(
      emSp("2026-08-19", "09:00").toISOString(),
    );
  });
});

describe("expediente — avançar consome só tempo de fila aberta", () => {
  it("começa a contar na abertura, não na chegada", () => {
    expect(avancarNoExpediente(emSp("2026-08-17", "22:00"), 30, COMERCIAL).toISOString()).toBe(
      emSp("2026-08-18", "08:30").toISOString(),
    );
  });

  /**
   * O caso que o painel sente: chega às 17h50 com 30 min de prazo. Somando
   * corrido, o prazo vence às 18h20 com a fila fechada e quem abre o painel às 8h
   * já encontra a conversa vermelha sem ter tido chance de responder.
   */
  it("atravessa o fechamento levando o resto do prazo para o dia seguinte", () => {
    expect(avancarNoExpediente(emSp("2026-08-17", "17:50"), 30, COMERCIAL).toISOString()).toBe(
      emSp("2026-08-18", "08:20").toISOString(),
    );
  });

  it("atravessa o almoço", () => {
    expect(avancarNoExpediente(emSp("2026-08-17", "11:55"), 30, COMERCIAL).toISOString()).toBe(
      emSp("2026-08-17", "13:55").toISOString(),
    );
  });

  it("dentro do expediente é soma direta", () => {
    expect(avancarNoExpediente(emSp("2026-08-18", "09:00"), 45, COMERCIAL).toISOString()).toBe(
      emSp("2026-08-18", "09:45").toISOString(),
    );
  });

  it("prazo que consome a semana inteira ainda termina em instante de fila aberta", () => {
    const prazo = avancarNoExpediente(emSp("2026-08-17", "10:00"), 60 * 30, COMERCIAL);
    expect(dentroDoExpediente(prazo, COMERCIAL)).toBe(true);
    expect(prazo.getTime()).toBeGreaterThan(emSp("2026-08-19", "00:00").getTime());
  });
});
