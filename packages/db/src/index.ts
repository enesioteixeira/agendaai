// Porta pública do @atende/db. prismaSemTenant NÃO é exportado daqui —
// quem precisa dele importa ./unsafe explicitamente (e o lint decide se pode).

export { prisma, Prisma, type PrismaTenant } from "./client";
export { runWithTenant, contextoTenantAtual, type ContextoTenant } from "./tenancy";
export { resolverEmpresaPorSlug, type EmpresaResolvida } from "./resolver-slug";
export { empresaDaSessao, type EmpresaDaSessao } from "./empresa-da-sessao";
export { cadastroInicial, type ResultadoOnboarding } from "./identidade/onboarding";
export {
  autenticar,
  montarSessao,
  type ResultadoLogin,
  type VinculoDisponivel,
} from "./identidade/autenticacao";
export {
  criarConvite,
  consultarConvite,
  aceitarConvite,
  listarEquipe,
  type ConviteCriado,
  type ConvitePublico,
  type AceiteResultado,
  type MembroEquipe,
} from "./identidade/convites";
export {
  catalogoBooking,
  slotsBooking,
  criarAgendamentoBooking,
  type CatalogoBooking,
  type BookingCriada,
} from "./agenda/booking";
export {
  registrarUsoDeIA,
  usoDoMes,
  limitesVigentes,
  podeUsarIA,
  type DadosDeUsoDeIA,
  type UsoDeIARegistrado,
  type UsoDoMesApurado,
  type LimitesVigentes,
} from "./plataforma/uso";
export {
  listarMotivosEncerramento,
  criarMotivoEncerramento,
  arquivarMotivoEncerramento,
  listarEtiquetas,
  criarEtiqueta,
  arquivarEtiqueta,
  aplicarEtiqueta,
  removerEtiqueta,
  listarRespostasRapidas,
  criarRespostaRapida,
  atualizarRespostaRapida,
  arquivarRespostaRapida,
  listarNotasDaConversa,
  criarNotaDeConversa,
  normalizarAtalho,
  atalhoRespostaRapidaSchema,
  type MotivoDeEncerramento,
  type EtiquetaDeConversa,
  type AplicacaoDeEtiqueta,
  type RespostaRapidaResumo,
  type NotaDeConversa,
} from "./atendimento/catalogos";
export {
  salvarConexaoGcal,
  desconectarGcal,
  aplicarJanelasGcal,
  executarSyncGcal,
  type ResultadoSyncGcal,
} from "./agenda/gcal-sync";
export {
  listarFilas,
  criarFila,
  atualizarFila,
  arquivarFila,
  definirMembrosDaFila,
  rotearConversa,
  assumirConversa,
  devolverParaFila,
  encerrarConversa,
  registrarPrimeiraResposta,
  listarInbox,
  type DadosDaFila,
  type FilaDetalhada,
  type MembroDaFila,
  type ResultadoRoteamento,
  type ResultadoPrimeiraResposta,
  type FiltroInbox,
  type ItemInbox,
} from "./atendimento/filas";
