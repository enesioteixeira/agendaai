// Porta pública do @atende/db. prismaSemTenant NÃO é exportado daqui —
// quem precisa dele importa ./unsafe explicitamente (e o lint decide se pode).

export { prisma, Prisma, type PrismaTenant } from "./client.js";
export { runWithTenant, contextoTenantAtual, type ContextoTenant } from "./tenancy.js";
export { resolverEmpresaPorSlug, type EmpresaResolvida } from "./resolver-slug.js";
export { cadastroInicial, type ResultadoOnboarding } from "./identidade/onboarding.js";
export {
  autenticar,
  montarSessao,
  type ResultadoLogin,
  type VinculoDisponivel,
} from "./identidade/autenticacao.js";
export {
  criarConvite,
  consultarConvite,
  aceitarConvite,
  listarEquipe,
  type ConviteCriado,
  type ConvitePublico,
  type AceiteResultado,
  type MembroEquipe,
} from "./identidade/convites.js";
export {
  catalogoBooking,
  slotsBooking,
  criarAgendamentoBooking,
  type CatalogoBooking,
  type BookingCriada,
} from "./agenda/booking.js";
export {
  salvarConexaoGcal,
  desconectarGcal,
  aplicarJanelasGcal,
  executarSyncGcal,
  type ResultadoSyncGcal,
} from "./agenda/gcal-sync.js";
