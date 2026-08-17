import { describe, expect, it } from "vitest";

import { ErroIntegracao } from "../tipos";
import { criarDriverInstantErp } from "./driver";
import { criarFetchDoSandbox, estadoInicial, pagarNoSandbox } from "./sandbox";

const CHAVE = "iep_live_sandbox";

function montar(estado = estadoInicial()) {
  const driver = criarDriverInstantErp({
    baseUrl: "https://erp.exemplo/api",
    apiKey: CHAVE,
    fetch: criarFetchDoSandbox(estado),
  });
  return { driver, estado };
}

describe("catálogo", () => {
  it("busca produtos e converte para o formato canônico", async () => {
    const { driver } = montar();
    const produtos = await driver.buscarProdutos({ termo: "corte" });
    expect(produtos).toHaveLength(1);
    expect(produtos[0]).toMatchObject({ idExterno: "P-1", precoCentavos: 5000 });
  });

  it("não devolve item inativo quando o filtro pede só ativos", async () => {
    const { driver } = montar();
    const todos = await driver.buscarProdutos({});
    expect(todos.map((p) => p.idExterno)).not.toContain("P-3");
  });

  /**
   * Não achar cliente é resultado, não erro: o fluxo de venda segue e o
   * cadastro nasce na hora do pedido. Levantar aqui obrigaria todo call site a
   * distinguir "não existe" de "deu ruim".
   */
  it("devolve null para cliente inexistente", async () => {
    const { driver } = montar();
    expect(await driver.buscarCliente({ telefone: "+5511000000000" })).toBeNull();
    expect(await driver.buscarCliente({ telefone: "+5511999998888" })).toMatchObject({
      idExterno: "C-1",
    });
  });
});

describe("idempotência de escrita", () => {
  /**
   * O caso comum, não o raro: timeout no meio de uma criação faz o worker
   * reenviar. Sem a chave de idempotência, o cliente ganha dois pedidos — e o
   * segundo vira cobrança que ninguém pediu.
   */
  it("o mesmo pedido reenviado não cria dois", async () => {
    const { driver, estado } = montar();
    const pedido = {
      idLocal: "local-123",
      idExternoCliente: "C-1",
      itens: [{ idExternoProduto: "P-1", quantidade: 1, precoUnitarioCentavos: 5000 }],
    };

    const um = await driver.criarPedido(pedido);
    const dois = await driver.criarPedido(pedido);

    expect(dois.idExterno).toBe(um.idExterno);
    expect(estado.pedidos.size).toBe(1);
  });

  it("a mesma cobrança reenviada devolve a mesma", async () => {
    const { driver, estado } = montar();
    const cobranca = {
      idLocal: "cob-local-1",
      idExternoCliente: "C-1",
      valorCentavos: 5000,
      vencimento: new Date("2026-09-01"),
    };

    const um = await driver.gerarCobranca(cobranca);
    const dois = await driver.gerarCobranca(cobranca);

    expect(dois.idExterno).toBe(um.idExterno);
    expect(estado.cobrancas.size).toBe(1);
  });
});

describe("cobrança", () => {
  it("emite com Pix copia-e-cola e valida o retorno", async () => {
    const { driver } = montar();
    const cob = await driver.gerarCobranca({
      idLocal: "x1",
      idExternoCliente: "C-1",
      valorCentavos: 8500,
      vencimento: new Date("2026-09-01"),
    });
    expect(cob.pixCopiaECola).toBeTruthy();
    expect(cob.vencimento).toBeInstanceOf(Date);
  });

  it("acompanha a mudança de status até a baixa", async () => {
    const { driver, estado } = montar();
    const cob = await driver.gerarCobranca({
      idLocal: "x2",
      idExternoCliente: "C-1",
      valorCentavos: 5000,
      vencimento: new Date("2026-09-01"),
    });

    expect(await driver.statusCobranca(cob.idExterno)).toBe("aberta");
    pagarNoSandbox(estado, cob.idExterno);
    expect(await driver.statusCobranca(cob.idExterno)).toBe("paga");
  });
});

describe("classificação de erro", () => {
  /**
   * O motor decide retry a partir da causa. Sem isso, a fila reprocessaria
   * para sempre um pedido que o ERP recusou por regra de negócio — e nunca
   * reprocessaria um que caiu por indisponibilidade momentânea.
   */
  it("credencial errada é erro de credencial, e não se repete", async () => {
    const driver = criarDriverInstantErp({
      baseUrl: "https://erp.exemplo/api",
      apiKey: "chave-errada",
      fetch: criarFetchDoSandbox(),
    });

    const erro = await driver.buscarProdutos({}).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroIntegracao);
    expect((erro as ErroIntegracao).causa).toBe("credencial");
    expect((erro as ErroIntegracao).retentavel).toBe(false);
  });

  it("falha de rede é indisponibilidade, e vale retry", async () => {
    const driver = criarDriverInstantErp({
      baseUrl: "https://erp.exemplo/api",
      apiKey: CHAVE,
      fetch: () => Promise.reject(new Error("ECONNREFUSED")),
    });

    const erro = await driver.buscarProdutos({}).catch((e: unknown) => e);
    expect((erro as ErroIntegracao).causa).toBe("indisponivel");
    expect((erro as ErroIntegracao).retentavel).toBe(true);
  });
});

describe("webhook", () => {
  it("normaliza o evento de baixa", async () => {
    const { driver } = montar();
    const eventos = await driver.receberWebhook({
      evento: "cobranca.paga",
      idExterno: "COB-1",
      ocorridoEm: "2026-08-16T12:00:00.000Z",
      valorCentavos: 5000,
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: "cobranca.paga", valorCentavos: 5000 });
    // `ocorridoEm` é do EVENTO: webhook reentregue horas depois precisa ser
    // ordenável pelo instante real, senão uma baixa antiga sobrescreve um
    // cancelamento novo.
    expect(eventos[0]?.ocorridoEm.toISOString()).toBe("2026-08-16T12:00:00.000Z");
  });

  it("recusa payload que não bate com o contrato", async () => {
    const { driver } = montar();
    await expect(
      driver.receberWebhook({ evento: "evento.inventado", idExterno: "X" }),
    ).rejects.toThrow();
  });
});
