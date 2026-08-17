// Sandbox de contrato do Instant ERP: um `fetch` falso que responde como o ERP
// vai responder quando existir.
//
// POR QUE ISTO EXISTE. O Instant ERP esta na Onda 0. Sem sandbox, a Fase G
// inteira ficaria esperando outro produto — e quando ele chegasse, a integracao
// comecaria do zero, sem ninguem nunca ter exercitado o contrato. Aqui o driver
// roda de verdade, contra as respostas que o contrato promete.
//
// NAO e mock de teste: e a implementacao de referencia do contrato. Quando o
// ERP subir, o mesmo conjunto de casos vira o teste de conformidade dele — se o
// ERP real responder diferente daqui, um dos dois esta fora do contrato, e a
// conversa passa a ser sobre qual.

export interface EstadoDoSandbox {
  produtos: { idExterno: string; nome: string; precoCentavos: number; ativo: boolean }[];
  clientes: { idExterno: string; nome: string; documento?: string; telefone?: string }[];
  pedidos: Map<string, { idExterno: string; idLocal: string }>;
  cobrancas: Map<string, { idExterno: string; status: string; valorCentavos: number }>;
}

export function estadoInicial(): EstadoDoSandbox {
  return {
    produtos: [
      { idExterno: "P-1", nome: "Corte masculino", precoCentavos: 5000, ativo: true },
      { idExterno: "P-2", nome: "Barba", precoCentavos: 3500, ativo: true },
      { idExterno: "P-3", nome: "Produto descontinuado", precoCentavos: 1000, ativo: false },
    ],
    clientes: [{ idExterno: "C-1", nome: "Maria Souza", telefone: "+5511999998888" }],
    pedidos: new Map(),
    cobrancas: new Map(),
  };
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * `fetch` do sandbox.
 *
 * Confere o `Authorization` de verdade: um driver que esquecesse de enviar a
 * chave passaria despercebido até o primeiro 401 em produção — e aí o erro
 * apareceria longe da causa.
 *
 * A idempotência também é real: o mesmo `Idempotency-Key` devolve o MESMO
 * pedido, em vez de criar outro. É o comportamento que o contrato exige e o que
 * protege o cliente de receber dois pedidos por causa de um timeout.
 */
export function criarFetchDoSandbox(
  estado: EstadoDoSandbox = estadoInicial(),
  opcoes: { readonly apiKeyEsperada?: string } = {},
): typeof globalThis.fetch {
  const chaveOk = opcoes.apiKeyEsperada ?? "iep_live_sandbox";

  return async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof entrada === "string" ? entrada : entrada.toString());
    const metodo = init?.method ?? "GET";
    const headers = new Headers(init?.headers);

    if (headers.get("Authorization") !== `Bearer ${chaveOk}`) {
      return json({ erro: { codigo: "nao_autorizado" } }, 401);
    }

    // O `baseUrl` do tenant pode ter prefixo (`https://erp/api`, um caminho de
    // proxy reverso, um subdiretório). O roteamento parte de `/v1/` para não
    // depender de como cada instalação do ERP está publicada — foi justamente
    // isso que quebrou na primeira execução deste sandbox.
    const inicio = url.pathname.indexOf("/v1/");
    const caminho = inicio >= 0 ? url.pathname.slice(inicio) : url.pathname;

    if (metodo === "GET" && caminho === "/v1/produtos") {
      const termo = url.searchParams.get("termo")?.toLowerCase();
      const apenasAtivos = url.searchParams.get("ativos") === "1";
      const dados = estado.produtos
        .filter((p) => (apenasAtivos ? p.ativo : true))
        .filter((p) => (termo ? p.nome.toLowerCase().includes(termo) : true));
      return json({ dados });
    }

    if (metodo === "GET" && caminho === "/v1/servicos") {
      return json({ dados: [] });
    }

    if (metodo === "GET" && caminho === "/v1/parceiros") {
      const doc = url.searchParams.get("documento");
      const tel = url.searchParams.get("telefone");
      const achado = estado.clientes.find(
        (c) => (doc && c.documento === doc) || (tel && c.telefone === tel),
      );
      return json({ dados: achado ? [achado] : [] });
    }

    if (metodo === "POST" && caminho === "/v1/pedidos") {
      const chave = headers.get("Idempotency-Key");
      if (chave && estado.pedidos.has(chave)) {
        return json({ dados: estado.pedidos.get(chave) });
      }
      const corpo = JSON.parse(String(init?.body ?? "{}")) as { idLocal?: string };
      const criado = { idExterno: `PED-${estado.pedidos.size + 1}`, idLocal: corpo.idLocal ?? "" };
      if (chave) estado.pedidos.set(chave, criado);
      return json({ dados: criado }, 201);
    }

    if (metodo === "POST" && caminho === "/v1/cobrancas") {
      const chave = headers.get("Idempotency-Key");
      if (chave && estado.cobrancas.has(chave)) {
        const j = estado.cobrancas.get(chave)!;
        return json({
          dados: {
            idExterno: j.idExterno,
            pixCopiaECola: `00020126...${j.idExterno}`,
            vencimento: new Date("2026-09-01").toISOString(),
          },
        });
      }
      const corpo = JSON.parse(String(init?.body ?? "{}")) as { valorCentavos?: number };
      const id = `COB-${estado.cobrancas.size + 1}`;
      estado.cobrancas.set(chave ?? id, {
        idExterno: id,
        status: "aberta",
        valorCentavos: corpo.valorCentavos ?? 0,
      });
      return json(
        {
          dados: {
            idExterno: id,
            pixCopiaECola: `00020126...${id}`,
            vencimento: new Date("2026-09-01").toISOString(),
          },
        },
        201,
      );
    }

    if (metodo === "GET" && caminho.startsWith("/v1/cobrancas/")) {
      const id = caminho.split("/").pop()!;
      const achada = [...estado.cobrancas.values()].find((c) => c.idExterno === id);
      if (!achada) return json({ erro: { codigo: "nao_encontrado" } }, 404);
      return json({ dados: { status: achada.status } });
    }

    return json({ erro: { codigo: "rota_inexistente" } }, 404);
  };
}

/** Marca uma cobrança como paga — para exercitar o caminho da baixa. */
export function pagarNoSandbox(estado: EstadoDoSandbox, idExterno: string): void {
  for (const c of estado.cobrancas.values()) {
    if (c.idExterno === idExterno) c.status = "paga";
  }
}
