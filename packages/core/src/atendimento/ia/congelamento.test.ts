import { describe, expect, it } from "vitest";

import { versaoAusente, versaoQueAtende } from "./congelamento";

const v = (id: string, agenteId = "ag-1", status = "publicada") => ({ id, agenteId, status });

describe("publicar é congelar", () => {
  it("congela a versão ativa no primeiro turno da conversa", () => {
    const d = versaoQueAtende(null, v("v2"));
    expect(d).toEqual({ versaoId: "v2", gravar: true, motivo: "congelada-agora" });
  });

  /**
   * O defeito que esta regra conserta: sem ela, o contexto resolvia a versão
   * ativa a cada turno, e publicar uma persona nova trocava o interlocutor no
   * meio da frase.
   */
  it("mantém a versão em que a conversa começou, mesmo com outra publicada depois", () => {
    const d = versaoQueAtende(v("v1"), v("v2"));
    expect(d.versaoId).toBe("v1");
    expect(d.gravar).toBe(false);
    expect(d.motivo).toBe("mantida");
  });

  it("não regrava quando nada mudou", () => {
    expect(versaoQueAtende(v("v1"), v("v1")).gravar).toBe(false);
  });

  /**
   * Despublicar é ato deliberado, e a razão mais comum é a versão estar
   * respondendo mal. Insistir nela para defender a continuidade seria usar a
   * regra contra a intenção de quem a operou.
   */
  it("recongela quando a versão congelada foi despublicada", () => {
    const d = versaoQueAtende(v("v1", "ag-1", "arquivada"), v("v2"));
    expect(d).toEqual({
      versaoId: "v2",
      gravar: true,
      motivo: "recongelada-versao-despublicada",
    });

    const rascunho = versaoQueAtende(v("v1", "ag-1", "rascunho"), v("v2"));
    expect(rascunho.versaoId).toBe("v2");
  });

  it("recongela quando o canal passou a apontar para outro agente", () => {
    const d = versaoQueAtende(v("v1", "ag-1"), v("v9", "ag-2"));
    expect(d).toEqual({ versaoId: "v9", gravar: true, motivo: "recongelada-outro-agente" });
  });

  /**
   * Sem versão não há turno. Deixar a conversa morrer para preservar a persona
   * trocaria um problema visível por um pior.
   */
  it("recongela quando a versão congelada sumiu do banco", () => {
    expect(versaoAusente(v("v2"))).toEqual({
      versaoId: "v2",
      gravar: true,
      motivo: "recongelada-versao-ausente",
    });
  });
});
