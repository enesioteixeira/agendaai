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
//
// maxUses: 1 NO WORKERS (receita OpenNext howtos/db): o Workers PROÍBE reusar
// um socket TCP criado em outra request ("Worker's code had hung and would
// never generate a response" — foi exatamente o bug do CRUD do B2). Com
// maxUses: 1 o pool descarta a conexão após cada uso e disca de novo dentro
// da request corrente. Em Node (testes/CI/worker) o pool reusa normalmente.

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let clientReal: PrismaClient | null = null;

const emWorkers =
  (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ===
  "Cloudflare-Workers";

function obterClientReal(): PrismaClient {
  if (clientReal) return clientReal;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL ausente — prismaSemTenant não conecta sem banco (hard-fail)");
  }
  const adapter = new PrismaPg({ connectionString, ...(emWorkers ? { maxUses: 1 } : {}) });
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
