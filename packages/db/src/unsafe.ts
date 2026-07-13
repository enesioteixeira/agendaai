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
//
// INICIALIZAÇÃO LAZY: o client conecta no PRIMEIRO USO, não no import. Isso
// permite `next build`/bundling sem DATABASE_URL e é o padrão correto em
// Cloudflare Workers (um client por isolate, criado sob demanda). O hard-fail
// sem DATABASE_URL continua valendo — só que na primeira query, não no import.

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let clientReal: PrismaClient | null = null;

function obterClientReal(): PrismaClient {
  if (clientReal) return clientReal;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL ausente — prismaSemTenant não conecta sem banco (hard-fail)");
  }
  const adapter = new PrismaPg({ connectionString });
  clientReal = new PrismaClient({ adapter });
  return clientReal;
}

// Proxy que difere a criação do client até o primeiro acesso a propriedade
// (ex.: prismaSemTenant.usuario, prismaSemTenant.$transaction).
export const prismaSemTenant: PrismaClient = new Proxy({} as PrismaClient, {
  get(_alvo, prop, receiver) {
    const c = obterClientReal();
    const valor = Reflect.get(c, prop, receiver);
    return typeof valor === "function" ? valor.bind(c) : valor;
  },
});
