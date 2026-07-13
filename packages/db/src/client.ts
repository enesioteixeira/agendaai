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
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
  "upsert",
]);

const OPS_COM_CREATE = new Set<string>(["create", "createMany", "createManyAndReturn"]);

const OPS_UPDATE_COM_DATA = new Set<string>(["update", "updateMany", "updateManyAndReturn"]);

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
    // o where do upsert já confinou a linha ao tenant, mas o UPDATE dele
    // poderia SETAR empresaId e transferir a linha para outro tenant — bloquear
    if (
      resultado.update &&
      "empresaId" in resultado.update &&
      resultado.update["empresaId"] !== empresaId
    ) {
      throw new Error("Upsert tentando trocar empresaId de uma linha — regra inviolável 1");
    }
  }
  if (OPS_UPDATE_COM_DATA.has(operation) && resultado.data && !Array.isArray(resultado.data)) {
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
        // FAIL-CLOSED: operação desconhecida NÃO passa sem filtro de tenant.
        // Se o Prisma ganhar operação nova (como updateManyAndReturn ganhou),
        // ela precisa ser classificada aqui antes de poder ser usada.
        if (!OPS_COM_WHERE.has(operation) && !OPS_COM_CREATE.has(operation)) {
          throw new Error(
            `Operação "${operation}" em ${model} não é coberta pela extension de tenancy — ` +
              "classifique-a em OPS_COM_WHERE/OPS_COM_CREATE (packages/db/src/client.ts) antes de usar (regra inviolável 1).",
          );
        }
        const { empresaId } = contextoTenantAtual();
        return query(injetarEmpresa(args as ArgsGenericos, operation, empresaId) as typeof args);
      },
    },
  },
});

export type PrismaTenant = typeof prisma;
export { Prisma };
