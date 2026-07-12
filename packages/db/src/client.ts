// Prisma Client com extension de tenancy (doc 01 §5.2, camada 1; doc 02 §15.1).
// A extension injeta `where { empresaId }` em toda leitura e `empresaId` em toda
// escrita, lendo o AsyncLocalStorage — o filtro NÃO é escrito à mão (regra 1).
// Models globais (sem empresaId) ficam na allowlist MODELS_GLOBAIS.

import { Prisma } from "@prisma/client";
import { prismaSemTenant } from "./unsafe";
import { contextoTenantAtual } from "./tenancy";

// Models de plataforma / globais — a extension NÃO injeta empresaId neles.
// Manter em sincronia com o schema (doc 02: Usuario.email global, Escopo é
// catálogo de produto; models de plataforma do §10 entram aqui quando criados).
const MODELS_GLOBAIS = new Set<string>(["Usuario", "Escopo"]);

// Operações cujo primeiro nível aceita `where` de filtro
const OPS_COM_WHERE = new Set<string>([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
  "upsert",
]);

const OPS_COM_CREATE = new Set<string>(["create", "createMany", "createManyAndReturn"]);

type ArgsGenericos = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
};

function injetarEmpresa(args: ArgsGenericos, operation: string, empresaId: string): ArgsGenericos {
  const resultado: ArgsGenericos = { ...args };

  if (OPS_COM_WHERE.has(operation)) {
    // Prisma 5+ aceita campos não-únicos adicionais no where de
    // findUnique/update/delete (extendedWhereUnique) — o empresaId entra
    // sempre, e conflito com valor divergente vindo do caller é erro.
    const whereAtual = (resultado.where ?? {}) as Record<string, unknown>;
    if ("empresaId" in whereAtual && whereAtual["empresaId"] !== empresaId) {
      throw new Error(
        `Query com empresaId divergente do contexto (${String(whereAtual["empresaId"])} != ${empresaId}) — regra inviolável 1`,
      );
    }
    resultado.where = { ...whereAtual, empresaId };
  }

  const carimbar = (data: Record<string, unknown>): Record<string, unknown> => {
    if ("empresaId" in data && data["empresaId"] !== empresaId) {
      throw new Error(
        `Escrita com empresaId divergente do contexto (${String(data["empresaId"])} != ${empresaId}) — regra inviolável 1`,
      );
    }
    return { ...data, empresaId };
  };

  if (OPS_COM_CREATE.has(operation) && resultado.data !== undefined) {
    resultado.data = Array.isArray(resultado.data)
      ? resultado.data.map(carimbar)
      : carimbar(resultado.data);
  }
  if (operation === "upsert") {
    if (resultado.create) resultado.create = carimbar(resultado.create);
    // update do upsert não precisa de carimbo: o where já confinou a linha ao tenant
  }
  if ((operation === "update" || operation === "updateMany") && resultado.data && !Array.isArray(resultado.data)) {
    // impedir "transferência" de linha entre tenants via update de empresaId
    if ("empresaId" in resultado.data && resultado.data["empresaId"] !== empresaId) {
      throw new Error("Update tentando trocar empresaId de uma linha — regra inviolável 1");
    }
  }

  return resultado;
}

export const prisma = prismaSemTenant.$extends({
  name: "tenancy",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (MODELS_GLOBAIS.has(model)) {
          return query(args);
        }
        const { empresaId } = contextoTenantAtual();
        return query(injetarEmpresa(args as ArgsGenericos, operation, empresaId) as typeof args);
      },
    },
  },
});

export type PrismaTenant = typeof prisma;
export { Prisma };
