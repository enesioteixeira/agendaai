// Contexto de tenant via AsyncLocalStorage (doc 01 §5.2, camada 1).
// Todo acesso a dado de tenant roda dentro de runWithTenant — a extension
// em client.ts lê este contexto para injetar empresaId em toda query/escrita.

import { AsyncLocalStorage } from "node:async_hooks";

export interface ContextoTenant {
  empresaId: string;
  usuarioId?: string;
  unidadeId?: string;
  papelId?: string;
}

const storage = new AsyncLocalStorage<ContextoTenant>();

export function runWithTenant<T>(ctx: ContextoTenant, fn: () => Promise<T>): Promise<T> {
  if (!ctx.empresaId) {
    throw new Error("runWithTenant exige empresaId (regra inviolável 1)");
  }
  // O `await fn()` DENTRO do run é essencial: a PrismaPromise é lazy — a query
  // (e a extension de tenancy que lê este contexto) só dispara no `.then()`.
  // Se retornássemos `storage.run(ctx, fn)` cru, o `.then()` ocorreria fora do
  // contexto e o empresaId se perderia. Aguardar aqui prende a execução ao store.
  return storage.run(ctx, async () => await fn());
}

export function contextoTenantAtual(): ContextoTenant {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      "Acesso a dado de tenant fora de runWithTenant (regra inviolável 1). " +
        "Jobs de plataforma auditados usam prismaSemTenant — ver allowlist no doc 09 §3.2.",
    );
  }
  return ctx;
}
