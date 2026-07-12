// Porta pública do @atende/db. prismaSemTenant NÃO é exportado daqui —
// quem precisa dele importa ./unsafe explicitamente (e o lint decide se pode).

export { prisma, Prisma, type PrismaTenant } from "./client";
export { runWithTenant, contextoTenantAtual, type ContextoTenant } from "./tenancy";
export { resolverEmpresaPorSlug, type EmpresaResolvida } from "./resolver-slug";
