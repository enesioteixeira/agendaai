import { afterEach, describe, expect, it } from "vitest";

import { agendaHabilitada } from "../src/lib/flags";

const original = process.env.AGENDA_HABILITADA;

afterEach(() => {
  if (original === undefined) delete process.env.AGENDA_HABILITADA;
  else process.env.AGENDA_HABILITADA = original;
});

describe("agendaHabilitada", () => {
  // O padrão é o que mais importa: a agenda saiu da superfície do produto, e
  // um ambiente novo — preview, VM nova, tenant novo — precisa nascer com ela
  // fechada sem que ninguém configure nada. Se este teste cair, a booking
  // pública volta ao ar sozinha.
  it("nasce desligada quando a variável não existe", () => {
    delete process.env.AGENDA_HABILITADA;
    expect(agendaHabilitada()).toBe(false);
  });

  it("liga apenas com a string exata 'true'", () => {
    process.env.AGENDA_HABILITADA = "true";
    expect(agendaHabilitada()).toBe(true);
  });

  // Valores que "parecem" ligados não ligam. É deliberado: numa var de ambiente
  // de Worker, "1", "sim" ou "TRUE" costumam ser digitados por engano ao mexer
  // em outra coisa, e o custo do engano aqui é expor a face pública de um
  // módulo congelado. Ligar exige escrever exatamente `true`.
  it.each(["1", "sim", "TRUE", "yes", "on", " true", ""])(
    "não liga com %j",
    (valor) => {
      process.env.AGENDA_HABILITADA = valor;
      expect(agendaHabilitada()).toBe(false);
    },
  );
});
