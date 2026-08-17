import { describe, expect, it } from "vitest";

import {
  exigirCapacidade,
  ferramentasDoErp,
  formaDeCobranca,
  nomesHabilitados,
  precisaVarrerCobrancas,
} from "./degradacao";
import { capacidadesInstantErp } from "./instant-erp/driver";
import type { CapacidadesErp, ConectorERP } from "./tipos";

const nada: CapacidadesErp = {
  produtos: false,
  servicos: false,
  pedidos: false,
  contratos: false,
  cobrancaPix: false,
  linkPagamento: false,
  baixaWebhook: false,
};

describe("forma de cobrança", () => {
  /**
   * Pix primeiro porque é o que fecha a venda dentro da conversa: o cliente
   * copia e cola sem sair do chat. Link exige abrir navegador, e é aí que se
   * perde gente no meio do caminho.
   */
  it("prefere Pix, cai para link, e admite não cobrar", () => {
    expect(formaDeCobranca({ ...nada, cobrancaPix: true, linkPagamento: true })).toBe("pix");
    expect(formaDeCobranca({ ...nada, linkPagamento: true })).toBe("link");
    expect(formaDeCobranca(nada)).toBe("nenhuma");
  });
});

describe("ferramentas oferecidas ao agente", () => {
  it("o Instant ERP habilita tudo", () => {
    expect(nomesHabilitados(capacidadesInstantErp).sort()).toEqual([
      "erpBuscarProdutos",
      "erpCriarPedido",
      "erpGerarPix",
      "erpStatusCobranca",
    ]);
  });

  /**
   * Oferecer uma ferramenta que o ERP não suporta é pior que não ter integração
   * nenhuma: o modelo tenta usar, recebe erro, e ou inventa uma desculpa ou
   * repete a tentativa. O cliente fica esperando por algo que nunca vai vir.
   */
  it("ERP sem cobrança não recebe ferramenta de cobrança", () => {
    const so_catalogo: CapacidadesErp = { ...nada, produtos: true };
    expect(nomesHabilitados(so_catalogo)).toEqual(["erpBuscarProdutos"]);
  });

  it("explica por que a ferramenta ficou de fora — é o texto que a tela mostra", () => {
    const comLink: CapacidadesErp = { ...nada, produtos: true, linkPagamento: true };
    const pix = ferramentasDoErp(comLink).find((f) => f.nome === "erpGerarPix");
    expect(pix?.motivoSeDesabilitada).toMatch(/não emite Pix.*link de pagamento/i);

    const semNada = ferramentasDoErp(nada).find((f) => f.nome === "erpGerarPix");
    expect(semNada?.motivoSeDesabilitada).toMatch(/não emite cobrança/i);
  });
});

describe("varredura de baixa", () => {
  /**
   * ERP sem webhook não avisa que foi pago: alguém tem de perguntar. Varrer
   * todo mundo "por garantia" gastaria chamada de API à toa nos ERPs que
   * avisam sozinhos.
   */
  it("só varre quem cobra e não avisa", () => {
    expect(precisaVarrerCobrancas({ ...nada, cobrancaPix: true, baixaWebhook: false })).toBe(true);
    expect(precisaVarrerCobrancas({ ...nada, cobrancaPix: true, baixaWebhook: true })).toBe(false);
    expect(precisaVarrerCobrancas(nada)).toBe(false);
  });
});

describe("guarda de chamada", () => {
  /**
   * Levanta em vez de devolver vazio: vazio seria lido como "não há produtos", e
   * o agente diria ao cliente que o catálogo está vazio quando ninguém chegou a
   * perguntar ao ERP.
   */
  it("recusa uso de capacidade que o conector não tem", () => {
    const fake = { tipo: "omie", capacidades: nada } as ConectorERP;
    expect(() => exigirCapacidade(fake, "pedidos")).toThrow(/não suporta "pedidos"/);
  });

  it("deixa passar o que o conector suporta", () => {
    const fake = { tipo: "instant_erp", capacidades: capacidadesInstantErp } as ConectorERP;
    expect(() => exigirCapacidade(fake, "pedidos")).not.toThrow();
  });
});
