import { describe, expect, it } from "vitest";

import {
  TTL_PROPOSTA_MS,
  expiraEmA_partirDe,
  lerResposta,
  podeConfirmar,
  type PropostaParaDecidir,
} from "./proposta";

const AGORA = new Date("2026-08-16T12:00:00Z");
const IDENTIDADE = "ident-do-cliente";

const pendente: PropostaParaDecidir = {
  status: "PENDENTE",
  expiraEm: new Date(AGORA.getTime() + 60_000),
  identidadeCanalId: IDENTIDADE,
};

describe("quem pode confirmar", () => {
  it("aceita a confirmação de quem originou, dentro do prazo", () => {
    expect(podeConfirmar(pendente, { identidadeCanalId: IDENTIDADE }, AGORA).pode).toBe(true);
  });

  /**
   * A checagem que não pode faltar. Sem ela, um "sim" vindo de outro canal do
   * mesmo cliente — ou de outra pessoa num número compartilhado — executaria uma
   * proposta que essa identidade nunca viu.
   */
  it("recusa confirmação vinda de outra identidade", () => {
    const v = podeConfirmar(pendente, { identidadeCanalId: "outra-pessoa" }, AGORA);
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toBe("outra-identidade");
  });

  it("recusa proposta vencida", () => {
    const vencida = { ...pendente, expiraEm: new Date(AGORA.getTime() - 1) };
    const v = podeConfirmar(vencida, { identidadeCanalId: IDENTIDADE }, AGORA);
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toBe("expirada");
  });

  /**
   * A ordem das checagens aparece na mensagem: dizer "expirou" para algo já
   * confirmado seria mentira, e mandaria o cliente refazer o que já aconteceu.
   */
  it("diz 'já está confirmado' em vez de 'expirou' quando a proposta já foi executada", () => {
    const confirmada = {
      ...pendente,
      status: "CONFIRMADA" as const,
      expiraEm: new Date(AGORA.getTime() - 60_000),
    };
    const v = podeConfirmar(confirmada, { identidadeCanalId: IDENTIDADE }, AGORA);
    expect(v.pode).toBe(false);
    if (!v.pode) {
      expect(v.motivo).toBe("nao-esta-pendente");
      expect(v.texto).toMatch(/já está confirmado/i);
    }
  });

  it("não vaza a existência da proposta para quem não é dono", () => {
    const v = podeConfirmar(pendente, { identidadeCanalId: "bisbilhoteiro" }, AGORA);
    if (!v.pode) {
      // "Não encontrei nada pendente" — e não "essa proposta não é sua", que
      // confirmaria que existe uma.
      expect(v.texto).not.toMatch(/não é sua|de outra pessoa|pertence/i);
    }
  });

  it("expira exatamente no limite, não depois", () => {
    const noLimite = { ...pendente, expiraEm: AGORA };
    expect(podeConfirmar(noLimite, { identidadeCanalId: IDENTIDADE }, AGORA).pode).toBe(false);
  });
});

describe("leitura da resposta", () => {
  it("entende confirmação e recusa diretas", () => {
    for (const s of ["sim", "SIM", "s", "ok", "confirmo", "pode", "isso", "👍", "Sim."]) {
      expect(lerResposta(s), s).toBe("confirma");
    }
    for (const s of ["não", "nao", "n", "cancela", "negativo", "👎"]) {
      expect(lerResposta(s), s).toBe("recusa");
    }
  });

  /**
   * O que está em jogo é executar uma escrita. Errar para "não entendi" custa
   * uma pergunta; errar para "confirma" custa um pedido que ninguém quis — e no
   * fluxo de venda isso é cobrança indevida.
   */
  it("devolve indefinida para tudo que é ambíguo", () => {
    for (const s of [
      "acho que sim",
      "sim, mas troca o horário",
      "pode ser amanhã?",
      "não sei",
      "quanto custa?",
      "",
    ]) {
      expect(lerResposta(s), s).toBe("indefinida");
    }
  });
});

describe("TTL", () => {
  it("são 15 minutos a partir de agora", () => {
    expect(TTL_PROPOSTA_MS).toBe(15 * 60_000);
    expect(expiraEmA_partirDe(AGORA).getTime() - AGORA.getTime()).toBe(TTL_PROPOSTA_MS);
  });
});
