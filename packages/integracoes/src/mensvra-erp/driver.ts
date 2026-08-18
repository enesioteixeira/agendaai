// Driver do Mensvra ERP — a integracao NATIVA da familia Mensvra.
//
// ⚠️ O ERP esta na Onda 0 e ainda NAO expoe esta API. O driver e escrito contra
// o CONTRATO (docs/contratos/erp-chanel-v1.md), que o Channel define e o ERP
// implementa nas Ondas de vendas e financeiro. Ate la ele roda contra o sandbox
// de fixtures (`sandbox.ts`), e e assim que o resto da Fase G avanca sem ficar
// esperando outro produto.
//
// A chave e do TENANT: o cliente do Channel informa a credencial do SEU tenant
// no ERP. A plataforma nunca correlaciona tenants por conta propria (doc 12 §1.3).

import {
  cobrancaEmitidaSchema,
  clienteErpSchema,
  eventoErpSchema,
  produtoErpSchema,
  servicoErpSchema,
  statusCobrancaSchema,
  type CobrancaEmitida,
  type CobrancaParaErp,
  type ClienteErp,
  type EventoErpNormalizado,
  type PedidoParaErp,
  type ProdutoErp,
  type ServicoErp,
  type StatusCobrancaErp,
} from "../formatos";
import { ErroIntegracao, type CapacidadesErp, type ConectorERP, type FiltroDeBusca } from "../tipos";

/** O Mensvra ERP faz tudo — é a integração nativa, não um adaptador de terceiro. */
export const capacidadesMensvraErp: CapacidadesErp = {
  produtos: true,
  servicos: true,
  pedidos: true,
  contratos: true,
  cobrancaPix: true,
  linkPagamento: true,
  baixaWebhook: true,
};

export interface ConfigMensvraErp {
  readonly baseUrl: string;
  /** Chave `iep_live_...` do tenant do cliente NO ERP. */
  readonly apiKey: string;
  /** Injetável para teste e para o sandbox de fixtures. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Traduz o HTTP em causa classificada — o motor decide retry a partir disto. */
function erroDeStatus(status: number, corpo: string): ErroIntegracao {
  if (status === 401 || status === 403) {
    return new ErroIntegracao("credencial", "Credencial do Mensvra ERP recusada.", corpo);
  }
  if (status === 429) {
    return new ErroIntegracao("limite", "Limite de requisições do Mensvra ERP atingido.", corpo);
  }
  if (status === 422 || status === 400) {
    // Recusa por regra de negócio do ERP: reenviar não muda nada, e insistir
    // deixaria a fila reprocessando para sempre um pedido inválido.
    return new ErroIntegracao("recusado", "O Mensvra ERP recusou a operação.", corpo);
  }
  if (status >= 500) {
    return new ErroIntegracao("indisponivel", "Mensvra ERP indisponível.", corpo);
  }
  return new ErroIntegracao("recusado", `Resposta inesperada do Mensvra ERP (${status}).`, corpo);
}

export function criarDriverMensvraErp(cfg: ConfigMensvraErp): ConectorERP {
  const http = cfg.fetch ?? globalThis.fetch;
  const base = cfg.baseUrl.replace(/\/+$/, "");

  async function chamar<T>(
    caminho: string,
    init: RequestInit & { idempotencia?: string } = {},
  ): Promise<T> {
    const { idempotencia, ...resto } = init;
    let resp: Response;
    try {
      resp = await http(`${base}${caminho}`, {
        ...resto,
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
          // A chave de idempotência é do NOSSO lado: um timeout no meio da
          // criação faz o worker reenviar, e sem ela o cliente ganharia dois
          // pedidos iguais. Timeout no meio de escrita é o caso comum.
          ...(idempotencia ? { "Idempotency-Key": idempotencia } : {}),
          ...(resto.headers ?? {}),
        },
      });
    } catch (e) {
      // Falha de rede nunca é "recusado": é indisponibilidade, e vale retry.
      throw new ErroIntegracao("indisponivel", "Não foi possível falar com o Mensvra ERP.", e);
    }

    if (!resp.ok) throw erroDeStatus(resp.status, await resp.text().catch(() => ""));
    return (await resp.json()) as T;
  }

  return {
    tipo: "mensvra_erp",
    capacidades: capacidadesMensvraErp,

    async buscarProdutos(filtro: FiltroDeBusca): Promise<ProdutoErp[]> {
      const q = new URLSearchParams();
      if (filtro.termo) q.set("termo", filtro.termo);
      if (filtro.limite) q.set("limite", String(filtro.limite));
      if (filtro.apenasAtivos !== false) q.set("ativos", "1");
      const dados = await chamar<{ dados: unknown[] }>(`/v1/produtos?${q}`);
      // Validação na borda: o que não bate com o contrato não entra. Um preço
      // vindo como string quebraria a soma do pedido lá na frente, longe daqui.
      return dados.dados.map((d) => produtoErpSchema.parse(d));
    },

    async buscarServicos(filtro: FiltroDeBusca): Promise<ServicoErp[]> {
      const q = new URLSearchParams();
      if (filtro.termo) q.set("termo", filtro.termo);
      const dados = await chamar<{ dados: unknown[] }>(`/v1/servicos?${q}`);
      return dados.dados.map((d) => servicoErpSchema.parse(d));
    },

    async buscarCliente(chave): Promise<ClienteErp | null> {
      const q = new URLSearchParams();
      if (chave.documento) q.set("documento", chave.documento);
      if (chave.telefone) q.set("telefone", chave.telefone);
      const dados = await chamar<{ dados: unknown[] }>(`/v1/parceiros?${q}`);
      const primeiro = dados.dados[0];
      // Não achar cliente é resultado, não erro: o fluxo de venda segue e o
      // cadastro é criado na hora do pedido.
      return primeiro ? clienteErpSchema.parse(primeiro) : null;
    },

    async criarPedido(pedido: PedidoParaErp): Promise<{ idExterno: string }> {
      const dados = await chamar<{ dados: { idExterno: string } }>("/v1/pedidos", {
        method: "POST",
        body: JSON.stringify(pedido),
        idempotencia: pedido.idLocal,
      });
      return { idExterno: dados.dados.idExterno };
    },

    async gerarCobranca(cobranca: CobrancaParaErp): Promise<CobrancaEmitida> {
      const dados = await chamar<{ dados: unknown }>("/v1/cobrancas", {
        method: "POST",
        body: JSON.stringify({ ...cobranca, vencimento: cobranca.vencimento.toISOString() }),
        idempotencia: cobranca.idLocal,
      });
      const bruto = dados.dados as Record<string, unknown>;
      return cobrancaEmitidaSchema.parse({
        ...bruto,
        vencimento: new Date(String(bruto.vencimento)),
      });
    },

    async statusCobranca(idExterno: string): Promise<StatusCobrancaErp> {
      const dados = await chamar<{ dados: { status: unknown } }>(`/v1/cobrancas/${idExterno}`);
      return statusCobrancaSchema.parse(dados.dados.status);
    },

    async receberWebhook(payload: unknown): Promise<EventoErpNormalizado[]> {
      // A ASSINATURA HMAC não é conferida aqui: ela é verificada na borda HTTP,
      // com o segredo do tenant, antes de o corpo chegar a este ponto. Misturar
      // as duas coisas faria um driver poder ser chamado sem passar pela
      // verificação — que é exatamente o buraco que o desenho evita.
      const bruto = payload as { evento?: unknown; ocorridoEm?: unknown } | null;
      if (!bruto || typeof bruto !== "object") return [];

      const b = bruto as Record<string, unknown>;
      return [
        eventoErpSchema.parse({
          tipo: b.evento,
          idExterno: b.idExterno,
          ocorridoEm: new Date(String(b.ocorridoEm)),
          valorCentavos: b.valorCentavos,
          dados: b.dados,
        }),
      ];
    },
  };
}
