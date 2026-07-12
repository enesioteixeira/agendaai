// prismaSemTenant — client cru, SEM extension de tenancy.
//
// ALLOWLIST DE IMPORT (lint-gated — doc 09 §3.2, allowlist idêntica no
// CLAUDE.md regra 1, doc 01 §5.2 e doc 02 §15.2):
//   1. interno a packages/db (migração/seed e resolver-slug.ts)
//   2. apps/worker/src/consumers/plataforma.ts (jobs de plataforma auditados)
// Import fora disso é bug de segurança, não estilo.
//
// Todo consumidor allowlistado tem comentário-justificativa e auditoria
// via AuditLog quando muta dado (doc 02 §15.2).

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function criarClientCru(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL ausente — prismaSemTenant não inicializa sem banco (hard-fail)");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalRef = globalThis as { __prismaSemTenant?: PrismaClient };

export const prismaSemTenant: PrismaClient = globalRef.__prismaSemTenant ?? criarClientCru();

if (process.env.NODE_ENV !== "production") {
  globalRef.__prismaSemTenant = prismaSemTenant;
}
