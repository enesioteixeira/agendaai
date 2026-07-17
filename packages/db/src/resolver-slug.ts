// resolverEmpresaPorSlug — a ÚNICA consulta pré-tenant da booking page
// ({slug}.atende-ai.com.br), que por definição roda ANTES de existir
// contexto de tenant (doc 02 §15.2). Interna ao package: usa
// prismaSemTenant sem exportá-lo (doc 09 §3.2).

import { prismaSemTenant } from "./unsafe.js";

export interface EmpresaResolvida {
  empresaId: string;
  nome: string;
  vertical: string;
}

export async function resolverEmpresaPorSlug(slug: string): Promise<EmpresaResolvida | null> {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(slug)) {
    return null; // slug malformado nunca chega ao banco
  }
  const empresa = await prismaSemTenant.empresa.findUnique({
    where: { slug },
    select: { id: true, nome: true, vertical: true, ativa: true },
  });
  if (!empresa || !empresa.ativa) return null;
  return { empresaId: empresa.id, nome: empresa.nome, vertical: empresa.vertical };
}
