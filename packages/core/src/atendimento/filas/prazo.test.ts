import { describe, expect, it } from "vitest";

import { calcularPrazoPrimeiraResposta, situacaoDoPrazo } from "./prazo";
import type { FilaParaRoteamento } from "./roteamento";

// 2026-08-17 é segunda; America/Sao_Paulo em UTC-3.
const COMERCIAL = {
  fuso: "America/Sao_Paulo",
  dias: {
    seg: [["08:00", "18:00"]],
    ter: [["08:00", "18:00"]],
    qua: [["08:00", "18:00"]],
    qui: [["08:00", "18:00"]],
    sex: [["08:00", "18:00"]],
  },
};

function emSp(data: string, hhmm: string): Date {
  return new Date(`${data}T${hhmm}:00-03:00`);
}

function fila(
  prazoPrimeiraRespostaMin: number | null,
  horarioJson: unknown = COMERCIAL,
): FilaParaRoteamento {
  return {
    id: "fila_1",
    distribuicao: "rodizio",
    prazoPrimeiraRespostaMin,
    horarioJson,
    membros: [],
  };
}

describe("prazo de primeira resposta", () => {
  it("fila sem prazo prometido não inventa prazo", () => {
    expect(calcularPrazoPrimeiraResposta(emSp("2026-08-17", "10:00"), fila(null))).toBeNull();
    expect(calcularPrazoPrimeiraResposta(emSp("2026-08-17", "10:00"), fila(0))).toBeNull();
    expect(calcularPrazoPrimeiraResposta(emSp("2026-08-17", "10:00"), fila(-5))).toBeNull();
  });

  it("dentro do expediente, soma direta", () => {
    expect(
      calcularPrazoPrimeiraResposta(emSp("2026-08-17", "10:00"), fila(30))?.toISOString(),
    ).toBe(emSp("2026-08-17", "10:30").toISOString());
  });

  /**
   * A regra que motivou o módulo: mensagem que chega às 22h numa fila que abre
   * às 8h tem prazo a partir das 8h. Contando corrido, TODA conversa da
   * madrugada nasceria estourada e o painel abriria vermelho todo dia às 8h —
   * alerta que sempre grita é alerta que ninguém olha.
   */
  it("mensagem da madrugada conta a partir da abertura", () => {
    expect(
      calcularPrazoPrimeiraResposta(emSp("2026-08-17", "22:00"), fila(30))?.toISOString(),
    ).toBe(emSp("2026-08-18", "08:30").toISOString());
  });

  it("sexta à noite espera a segunda", () => {
    expect(
      calcularPrazoPrimeiraResposta(emSp("2026-08-21", "19:00"), fila(60))?.toISOString(),
    ).toBe(emSp("2026-08-24", "09:00").toISOString());
  });

  it("fila 24 por 7 conta corrido", () => {
    expect(
      calcularPrazoPrimeiraResposta(emSp("2026-08-17", "22:00"), fila(30, null))?.toISOString(),
    ).toBe(emSp("2026-08-17", "22:30").toISOString());
  });
});

describe("situação do prazo", () => {
  const prazo = emSp("2026-08-17", "10:30");

  it("sem prazo é sem_prazo", () => {
    expect(situacaoDoPrazo(emSp("2026-08-17", "10:00"), null, null)).toBe("sem_prazo");
  });

  it("com folga é no_prazo", () => {
    expect(situacaoDoPrazo(emSp("2026-08-17", "10:05"), prazo, null, 30)).toBe("no_prazo");
  });

  /** O alerta que o painel exige acontece ANTES do estouro: 80% do prazo corrido. */
  it("acende o alerta aos 80% do prazo", () => {
    expect(situacaoDoPrazo(emSp("2026-08-17", "10:23"), prazo, null, 30)).toBe("no_prazo");
    expect(situacaoDoPrazo(emSp("2026-08-17", "10:24"), prazo, null, 30)).toBe("perto_do_estouro");
    expect(situacaoDoPrazo(emSp("2026-08-17", "10:29"), prazo, null, 30)).toBe("perto_do_estouro");
  });

  it("sem o total do prazo, alerta nos últimos 5 minutos", () => {
    expect(situacaoDoPrazo(emSp("2026-08-17", "10:24"), prazo, null)).toBe("no_prazo");
    expect(situacaoDoPrazo(emSp("2026-08-17", "10:26"), prazo, null)).toBe("perto_do_estouro");
  });

  it("no instante do prazo já é estourado", () => {
    expect(situacaoDoPrazo(prazo, prazo, null, 30)).toBe("estourado");
    expect(situacaoDoPrazo(emSp("2026-08-17", "11:00"), prazo, null, 30)).toBe("estourado");
  });

  /**
   * Respondida é cumprido mesmo com atraso: quem mede atraso é o relatório. Se o
   * alerta continuasse aceso depois da resposta, a fila do painel encheria de
   * conversa que ninguém mais pode salvar e esconderia as que ainda dá.
   */
  it("conversa respondida é cumprido, mesmo respondida atrasada", () => {
    const respondida = emSp("2026-08-17", "12:00");
    expect(situacaoDoPrazo(emSp("2026-08-17", "13:00"), prazo, respondida, 30)).toBe("cumprido");
    expect(situacaoDoPrazo(emSp("2026-08-17", "13:00"), null, respondida)).toBe("cumprido");
  });

  /**
   * O prazo pode ter atravessado a noite: às 5h da manhã falta muito tempo
   * CORRIDO, mas o painel não pode acender alerta de uma conversa que ainda tem
   * o expediente inteiro pela frente — e às 8h20, com 10 min de expediente até o
   * prazo, tem que acender.
   */
  it("não acende alerta durante a noite de fila fechada", () => {
    const prazoDaManha = emSp("2026-08-18", "08:30");
    expect(situacaoDoPrazo(emSp("2026-08-18", "05:00"), prazoDaManha, null, 30)).toBe("no_prazo");
    expect(situacaoDoPrazo(emSp("2026-08-18", "08:25"), prazoDaManha, null, 30)).toBe(
      "perto_do_estouro",
    );
  });
});
