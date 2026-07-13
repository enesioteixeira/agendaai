// Porta pública do @atende/db. prismaSemTenant NÃO é exportado daqui —
// quem precisa dele importa ./unsafe explicitamente (e o lint decide se pode).

export { prisma, Prisma, type PrismaTenant } from "./client";
export { runWithTenant, contextoTenantAtual, type ContextoTenant } from "./tenancy";
export { resolverEmpresaPorSlug, type EmpresaResolvida } from "./resolver-slug";
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
  type ResultadoAceite,
  type MembroEquipe,
} from "./identidade/convites";
