/**
 * HUB DE INTEGRACOES DE RETAGUARDA — ERP e CRM.
 *
 * Camada anticorrupcao, no mesmo regime de `@atende/canais`: **nada fora deste
 * pacote fala com API de ERP ou CRM**. O motor conversa com `ConectorERP`, e
 * qual sistema esta do outro lado e configuracao do tenant.
 *
 * A regra que sustenta o desenho e a mesma dos canais, aplicada a outro eixo:
 * **o conector degrada, o motor nunca se adapta**. Um ERP que nao emite Pix nao
 * vira um `if` no meio da regra de venda — vira uma capacidade `false`, e a
 * ferramenta correspondente simplesmente nao e oferecida ao agente.
 */

export {
  centavos,
  clienteErpSchema,
  cobrancaEmitidaSchema,
  cobrancaParaErpSchema,
  contatoCrmSchema,
  eventoErpSchema,
  oportunidadeCrmSchema,
  pedidoParaErpSchema,
  produtoErpSchema,
  servicoErpSchema,
  statusCobrancaSchema,
  type ClienteErp,
  type CobrancaEmitida,
  type CobrancaParaErp,
  type ContatoCrm,
  type EventoErpNormalizado,
  type OportunidadeCrm,
  type PedidoParaErp,
  type ProdutoErp,
  type ServicoErp,
  type StatusCobrancaErp,
} from "./formatos";

export {
  ErroIntegracao,
  type CapacidadesErp,
  type CausaErroIntegracao,
  type ConectorCRM,
  type ConectorERP,
  type FiltroDeBusca,
  type TipoCrm,
  type TipoErp,
} from "./tipos";

export {
  exigirCapacidade,
  ferramentasDoErp,
  formaDeCobranca,
  nomesHabilitados,
  precisaVarrerCobrancas,
  type FerramentaHabilitada,
  type FormaDeCobranca,
} from "./degradacao";

export {
  capacidadesMensvraErp,
  criarDriverMensvraErp,
  type ConfigMensvraErp,
} from "./mensvra-erp/driver";

export {
  criarFetchDoSandbox,
  estadoInicial,
  pagarNoSandbox,
  type EstadoDoSandbox,
} from "./mensvra-erp/sandbox";
