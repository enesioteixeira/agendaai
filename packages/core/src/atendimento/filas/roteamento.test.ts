import { describe, expect, it } from "vitest";

import {
  escolherAtendente,
  type Distribuicao,
  type FilaParaRoteamento,
  type MembroParaRoteamento,
} from "./roteamento";

function membro(
  usuarioId: string,
  conversasAbertas = 0,
  ativo = true,
): MembroParaRoteamento {
  return { usuarioId, ativo, conversasAbertas };
}

function fila(
  distribuicao: Distribuicao,
  membros: readonly MembroParaRoteamento[],
): FilaParaRoteamento {
  return {
    id: "fila_1",
    distribuicao,
    prazoPrimeiraRespostaMin: null,
    horarioJson: null,
    membros,
  };
}

const TODAS: Distribuicao[] = ["rodizio", "carga", "carteira", "manual"];

describe("roteamento — invariantes de todas as distribuições", () => {
  /**
   * Fila só com inativo é o estado real de uma equipe em férias coletiva.
   * Devolver alguém aqui cria conversa atribuída a quem não abre o painel — a
   * conversa some da fila e ninguém responde.
   */
  it("fila sem membro ativo devolve null em qualquer distribuição", () => {
    const inativos = [membro("u_a", 0, false), membro("u_b", 0, false)];
    for (const d of TODAS) {
      expect(escolherAtendente(fila(d, inativos), { vendedorIdDoCliente: "u_a" })).toBeNull();
    }
    for (const d of TODAS) {
      expect(escolherAtendente(fila(d, []))).toBeNull();
    }
  });

  it("nunca devolve quem não é membro ativo", () => {
    const membros = [membro("u_ativo", 9), membro("u_inativo", 0, false)];
    for (const d of TODAS) {
      const escolhido = escolherAtendente(fila(d, membros), {
        vendedorIdDoCliente: "u_inativo",
        ultimoAtendenteId: "u_inativo",
      });
      expect(escolhido === null || escolhido === "u_ativo").toBe(true);
    }
  });
});

describe("roteamento — manual", () => {
  it("devolve null mesmo com fila cheia de gente livre", () => {
    expect(escolherAtendente(fila("manual", [membro("u_a"), membro("u_b")]))).toBeNull();
  });
});

describe("roteamento — rodízio", () => {
  const membros = [membro("u_a"), membro("u_b"), membro("u_c")];

  it("sem último atendente, começa pelo primeiro", () => {
    expect(escolherAtendente(fila("rodizio", membros))).toBe("u_a");
  });

  it("devolve o próximo depois do último", () => {
    expect(escolherAtendente(fila("rodizio", membros), { ultimoAtendenteId: "u_a" })).toBe("u_b");
    expect(escolherAtendente(fila("rodizio", membros), { ultimoAtendenteId: "u_b" })).toBe("u_c");
  });

  it("dá a volta quando o último é o fim da lista", () => {
    expect(escolherAtendente(fila("rodizio", membros), { ultimoAtendenteId: "u_c" })).toBe("u_a");
  });

  /**
   * O ponteiro do rodízio é uma DICA (o último atendente daquela fila), não
   * estado autoritativo: quem saiu da equipe continua gravado nas conversas
   * antigas. Perder a vez seria menos ruim do que devolver null e a conversa
   * ficar parada — mas recomeçar do primeiro é o único comportamento que não
   * depende de saber onde o ex-membro estava.
   */
  it("recomeça do primeiro quando o último não está mais entre os ativos", () => {
    expect(escolherAtendente(fila("rodizio", membros), { ultimoAtendenteId: "u_saiu" })).toBe("u_a");

    const comInativo = [membro("u_a"), membro("u_b", 0, false), membro("u_c")];
    expect(escolherAtendente(fila("rodizio", comInativo), { ultimoAtendenteId: "u_b" })).toBe("u_a");
  });

  it("pula os inativos ao andar", () => {
    const comInativo = [membro("u_a"), membro("u_b", 0, false), membro("u_c")];
    expect(escolherAtendente(fila("rodizio", comInativo), { ultimoAtendenteId: "u_a" })).toBe("u_c");
  });
});

describe("roteamento — carga", () => {
  it("manda para quem tem menos conversa aberta", () => {
    const membros = [membro("u_a", 7), membro("u_b", 2), membro("u_c", 5)];
    expect(escolherAtendente(fila("carga", membros))).toBe("u_b");
  });

  it("ignora a carga de quem está inativo", () => {
    const membros = [membro("u_a", 7), membro("u_zerado", 0, false)];
    expect(escolherAtendente(fila("carga", membros))).toBe("u_a");
  });

  /**
   * Empate resolvido pela ordem do array faria o resultado depender do ORDER BY
   * da consulta: o teste passaria hoje e quebraria no dia em que alguém trocasse
   * o índice usado. Por isso a regra é o menor usuarioId, e o teste embaralha.
   */
  it("empate cai no menor usuarioId, em qualquer ordem do array", () => {
    const ordem1 = [membro("u_z", 3), membro("u_a", 3), membro("u_m", 3)];
    const ordem2 = [membro("u_m", 3), membro("u_z", 3), membro("u_a", 3)];
    expect(escolherAtendente(fila("carga", ordem1))).toBe("u_a");
    expect(escolherAtendente(fila("carga", ordem2))).toBe("u_a");
  });
});

describe("roteamento — carteira", () => {
  const membros = [membro("u_a", 9), membro("u_vendedor", 4), membro("u_c", 1)];

  it("manda para o vendedor do cliente, mesmo que ele esteja mais carregado", () => {
    expect(
      escolherAtendente(fila("carteira", membros), { vendedorIdDoCliente: "u_vendedor" }),
    ).toBe("u_vendedor");
  });

  /**
   * Vendedor que não atende esta fila (ou está inativo) não pode segurar o
   * cliente: quem espera resposta não é hora de fidelidade. Cai no rodízio.
   */
  it("cai no rodízio quando o vendedor não é membro ativo", () => {
    expect(
      escolherAtendente(fila("carteira", membros), {
        vendedorIdDoCliente: "u_de_outra_fila",
        ultimoAtendenteId: "u_a",
      }),
    ).toBe("u_vendedor");

    const vendedorInativo = [membro("u_a"), membro("u_vendedor", 0, false)];
    expect(
      escolherAtendente(fila("carteira", vendedorInativo), {
        vendedorIdDoCliente: "u_vendedor",
      }),
    ).toBe("u_a");
  });

  it("cliente sem carteira cai no rodízio", () => {
    expect(escolherAtendente(fila("carteira", membros), { ultimoAtendenteId: "u_vendedor" })).toBe(
      "u_c",
    );
    expect(escolherAtendente(fila("carteira", membros))).toBe("u_a");
  });
});
