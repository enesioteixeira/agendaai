import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A action é a superfície pública do módulo congelado: roda SEM sessão e
// descobre o tenant pelo slug. Esconder a página não a protege — Server Action
// é um POST endereçável, e o `notFound()` do layout só apaga a tela.
//
// O que este teste prova é mais forte que "devolveu erro": prova que o portão
// vem ANTES de qualquer trabalho de banco. Por isso a asserção é sobre
// `criarAgendamentoBooking` nunca ter sido chamada — com o sinalizador
// desligado, uma requisição forjada não deve nem alcançar o slug.
const criarAgendamentoBooking = vi.fn();

vi.mock("@atende/db", () => ({
  criarAgendamentoBooking: (...args: unknown[]) => criarAgendamentoBooking(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect não deveria acontecer com a agenda desligada");
  },
}));

const { agendarBookingAction } = await import("../src/modules/booking/actions");

const original = process.env.AGENDA_HABILITADA;

beforeEach(() => {
  criarAgendamentoBooking.mockReset();
});

afterEach(() => {
  if (original === undefined) delete process.env.AGENDA_HABILITADA;
  else process.env.AGENDA_HABILITADA = original;
});

function formularioValido(): FormData {
  const dados = new FormData();
  dados.set("slug", "aurora");
  dados.set("servicoId", "svc_1");
  dados.set("profissionalId", "prof_1");
  dados.set("data", "2026-09-01");
  dados.set("hora", "10:00");
  dados.set("clienteNome", "Cliente Teste");
  dados.set("clienteTelefone", "+5548999999999");
  return dados;
}

describe("agendarBookingAction com a agenda fora do produto", () => {
  it("recusa sem tocar no banco quando o sinalizador não existe", async () => {
    delete process.env.AGENDA_HABILITADA;

    const estado = await agendarBookingAction({}, formularioValido());

    expect(estado.erro).toBeTruthy();
    expect(criarAgendamentoBooking).not.toHaveBeenCalled();
  });

  // Dados válidos são o caso perigoso: com o portão ausente, é exatamente esta
  // requisição que criaria um agendamento num tenant que nem exibe agenda.
  it("recusa mesmo com dados perfeitamente válidos", async () => {
    process.env.AGENDA_HABILITADA = "false";

    const estado = await agendarBookingAction({}, formularioValido());

    expect(estado.erro).toBeTruthy();
    expect(criarAgendamentoBooking).not.toHaveBeenCalled();
  });

  // O contrapositivo: sem ele, um `return { erro }` no topo da função passaria
  // nos dois testes acima e a agenda nunca mais voltaria ao ar.
  it("deixa passar para o banco quando a agenda está ligada", async () => {
    process.env.AGENDA_HABILITADA = "true";
    criarAgendamentoBooking.mockRejectedValue(new Error("banco simulado"));

    await agendarBookingAction({}, formularioValido());

    expect(criarAgendamentoBooking).toHaveBeenCalledTimes(1);
  });
});
