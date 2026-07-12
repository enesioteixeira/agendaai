// Teste de isolamento de tenant — critério de pronto do MVP (doc 04 §2.8):
// dados de um tenant NUNCA aparecem em queries de outro. Roda contra um
// Postgres de teste (DATABASE_URL_TEST); sem a env, o suite é pulado —
// no CI ele é obrigatório (doc 09 §6, Postgres efêmero do runner).

import { describe, it, expect, beforeAll } from "vitest";

const urlTeste = process.env.DATABASE_URL_TEST;

describe.skipIf(!urlTeste)("isolamento de tenant (extension de tenancy)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = urlTeste;
  });

  it("query sob tenant B não enxerga unidades do tenant A", async () => {
    const { prisma } = await import("./client");
    const { runWithTenant } = await import("./tenancy");
    const { prismaSemTenant } = await import("./unsafe");

    const a = await prismaSemTenant.empresa.create({
      data: { slug: `iso-a-${Date.now()}`, nome: "Tenant A", vertical: "salao" },
    });
    const b = await prismaSemTenant.empresa.create({
      data: { slug: `iso-b-${Date.now()}`, nome: "Tenant B", vertical: "barbearia" },
    });

    await runWithTenant({ empresaId: a.id }, async () => {
      await prisma.unidade.create({ data: { nome: "Matriz A" } as never });
    });

    const vistasPorB = await runWithTenant({ empresaId: b.id }, () =>
      prisma.unidade.findMany(),
    );
    expect(vistasPorB).toHaveLength(0);

    const vistasPorA = await runWithTenant({ empresaId: a.id }, () =>
      prisma.unidade.findMany(),
    );
    expect(vistasPorA).toHaveLength(1);
    expect(vistasPorA[0]?.empresaId).toBe(a.id);
  });

  it("acesso fora de runWithTenant falha alto", async () => {
    const { prisma } = await import("./client");
    await expect(prisma.unidade.findMany()).rejects.toThrow(/fora de runWithTenant/);
  });

  it("escrita com empresaId divergente do contexto é recusada", async () => {
    const { prisma } = await import("./client");
    const { runWithTenant } = await import("./tenancy");

    await expect(
      runWithTenant({ empresaId: "tenant-x" }, async () => {
        await prisma.unidade.create({
          data: { nome: "Invasora", empresaId: "tenant-y" } as never,
        });
      }),
    ).rejects.toThrow(/regra inviolável 1/);
  });
});
