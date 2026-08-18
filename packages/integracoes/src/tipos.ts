// Interface unica dos conectores de retaguarda — ERP e CRM.
//
// Mesma fronteira anticorrupcao de `packages/canais`, aplicada a outro eixo:
// nada fora deste pacote importa SDK ou cliente HTTP de ERP/CRM. O motor fala
// com `ConectorERP`, e qual ERP esta do outro lado e detalhe de configuracao do
// tenant.

import type {
  ClienteErp,
  CobrancaEmitida,
  CobrancaParaErp,
  ContatoCrm,
  EventoErpNormalizado,
  OportunidadeCrm,
  PedidoParaErp,
  ProdutoErp,
  ServicoErp,
  StatusCobrancaErp,
} from "./formatos";

export type TipoErp =
  | "mensvra_erp"
  | "sankhya"
  | "omie"
  | "bling"
  | "tiny"
  | "conta_azul"
  | "totvs";

export type TipoCrm = "ploomes" | "rd_station" | "pipedrive" | "hubspot";

/**
 * O que ESTE ERP sabe fazer.
 *
 * Declarado, nunca deduzido. O motor pergunta antes de oferecer: um agente que
 * promete Pix num ERP que nao emite Pix nao esta com bug — esta mentindo para o
 * cliente, que e pior. Ver `degradacao.ts`.
 */
export interface CapacidadesErp {
  readonly produtos: boolean;
  readonly servicos: boolean;
  readonly pedidos: boolean;
  readonly contratos: boolean;
  readonly cobrancaPix: boolean;
  readonly linkPagamento: boolean;
  /** O ERP avisa a baixa por webhook, ou só dá para descobrir consultando? */
  readonly baixaWebhook: boolean;
}

export interface FiltroDeBusca {
  readonly termo?: string;
  readonly limite?: number;
  readonly apenasAtivos?: boolean;
}

export interface ConectorERP {
  readonly tipo: TipoErp;
  readonly capacidades: CapacidadesErp;

  buscarProdutos(filtro: FiltroDeBusca): Promise<ProdutoErp[]>;
  buscarServicos(filtro: FiltroDeBusca): Promise<ServicoErp[]>;
  /** Busca por documento ou telefone. `null` quando não existe — não é erro. */
  buscarCliente(chave: { documento?: string; telefone?: string }): Promise<ClienteErp | null>;

  /**
   * As escritas recebem `idLocal` e o driver o repassa como chave de
   * idempotência ao ERP. Reenviar o mesmo pedido depois de um timeout não pode
   * criar dois — e timeout no meio de uma criação é o caso comum, não o raro.
   */
  criarPedido(pedido: PedidoParaErp): Promise<{ idExterno: string }>;
  gerarCobranca(cobranca: CobrancaParaErp): Promise<CobrancaEmitida>;
  statusCobranca(idExterno: string): Promise<StatusCobrancaErp>;

  /** Webhook bruto → eventos canônicos. Valida com Zod; inválido não passa. */
  receberWebhook(payload: unknown): Promise<EventoErpNormalizado[]>;
}

export interface ConectorCRM {
  readonly tipo: TipoCrm;
  buscarContato(chave: { email?: string; telefone?: string }): Promise<ContatoCrm | null>;
  criarContato(contato: Omit<ContatoCrm, "idExterno">): Promise<{ idExterno: string }>;
  criarOportunidade(
    op: Omit<OportunidadeCrm, "idExterno">,
  ): Promise<{ idExterno: string }>;
  /** Registra a conversa encerrada como atividade na timeline do contato. */
  registrarAtividade(atividade: {
    idExternoContato: string;
    titulo: string;
    descricao: string;
    ocorridoEm: Date;
  }): Promise<void>;
}

/**
 * Erro de integração com causa classificada.
 *
 * O motor precisa saber se vale insistir: `indisponivel` e `limite` passam com
 * o tempo, `credencial` e `recusado` não. Sem isso, a fila de sincronização
 * reprocessa para sempre um pedido que o ERP recusou por regra de negócio.
 */
export type CausaErroIntegracao =
  | "credencial"
  | "indisponivel"
  | "limite"
  | "recusado"
  | "contrato";

export class ErroIntegracao extends Error {
  constructor(
    readonly causa: CausaErroIntegracao,
    mensagem: string,
    readonly detalhe?: unknown,
  ) {
    super(mensagem);
    this.name = "ErroIntegracao";
  }

  /** Vale reenfileirar? */
  get retentavel(): boolean {
    return this.causa === "indisponivel" || this.causa === "limite";
  }
}
