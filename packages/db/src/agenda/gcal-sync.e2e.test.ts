// E2E da parte DETERMINÍSTICA do GCal pull (sem Google): aplicarJanelasGcal
// substitui os bloqueios origemGcal do profissional (replace-all idempotente),
// não toca bloqueios manuais e o resultado some da vitrine da booking.

import { describe, it, expect, beforeAll } from "vitest";

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

function amanha(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe.skipIf(!url)("B5 — GCal pull (aplicarJanelasGcal)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = url;
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "0".repeat(64);
  });

  it("replace-all: substitui janelas anteriores, preserva bloqueio manual, reflete na booking", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");
    const { prismaSemTenant } = await import("../unsafe");
    const { aplicarJanelasGcal } = await import("./gcal-sync");
    const { slotsBooking } = await import("./booking");
    const { paraUtc } = await import("@atende/core");

    const s = Date.now();
    const empresa = await prismaSemTenant.empresa.create({
      data: { slug: `gcal-teste-${s}`, nome: "GCal Teste", vertical: "salao" },
    });
    const { profissional, servico, manual } = await runWithTenant(
      { empresaId: empresa.id },
      async () => {
        const unidade = await prisma.unidade.create({ data: { nome: "Matriz" } as never });
        const profissional = await prisma.profissional.create({
          data: { nome: "Pro GCal", unidadeId: unidade.id } as never,
        });
        await prisma.horarioTrabalho.createMany({
          data: Array.from({ length: 7 }, (_, d) => ({
            profissionalId: profissional.id,
            unidadeId: unidade.id,
            diaSemana: d,
            horaInicio: "09:00",
            horaFim: "12:00",
          })) as never,
        });
        const servico = await prisma.servico.create({
          data: { nome: "Corte", duracaoMin: 30, precoCentavos: 5000 } as never,
        });
        // conexão + um bloqueio MANUAL que o sync não pode tocar
        await prisma.sincronizacaoGcal.create({
          data: { profissionalId: profissional.id, tokensCifrados: "enc:x:y:z", estadoSync: "ativo" } as never,
        });
        const manual = await prisma.bloqueio.create({
          data: {
            tipo: "almoco",
            profissionalId: profissional.id,
            inicio: new Date("2030-01-01T15:00:00Z"),
            fim: new Date("2030-01-01T16:00:00Z"),
          } as never,
        });
        return { profissional, servico, manual };
      },
    );

    const data = amanha();
    const FUSO = "America/Sao_Paulo";

    // 1ª aplicação: ocupado 09:00–10:00
    await aplicarJanelasGcal(empresa.id, profissional.id, [
      { inicio: paraUtc(data, "09:00", FUSO), fim: paraUtc(data, "10:00", FUSO) },
    ]);
    const v1 = await slotsBooking(`gcal-teste-${s}`, servico.id, profissional.id, data);
    expect(v1?.slots).not.toContain("09:00");
    expect(v1?.slots).not.toContain("09:30");
    expect(v1?.slots).toContain("10:00");

    // 2ª aplicação (janela mudou no Google): replace-all — a antiga sai, a nova entra
    await aplicarJanelasGcal(empresa.id, profissional.id, [
      { inicio: paraUtc(data, "11:00", FUSO), fim: paraUtc(data, "12:00", FUSO) },
    ]);
    const v2 = await slotsBooking(`gcal-teste-${s}`, servico.id, profissional.id, data);
    expect(v2?.slots).toContain("09:00"); // liberou
    expect(v2?.slots).not.toContain("11:00"); // ocupou

    // bloqueio manual continua intacto; ultimaSyncEm registrada
    const estado = await runWithTenant({ empresaId: empresa.id }, async () => ({
      manual: await prisma.bloqueio.findUnique({ where: { id: manual.id } }),
      gcal: await prisma.bloqueio.findMany({ where: { profissionalId: profissional.id, origemGcal: true } }),
      sync: await prisma.sincronizacaoGcal.findUnique({ where: { profissionalId: profissional.id } }),
    }));
    expect(estado.manual).not.toBeNull();
    expect(estado.gcal).toHaveLength(1);
    expect(estado.sync?.ultimaSyncEm).not.toBeNull();

    // 3ª aplicação vazia (agenda do Google esvaziou): remove tudo do gcal
    await aplicarJanelasGcal(empresa.id, profissional.id, []);
    const restantes = await runWithTenant({ empresaId: empresa.id }, () =>
      prisma.bloqueio.findMany({ where: { profissionalId: profissional.id } }),
    );
    expect(restantes.map((b) => b.id)).toEqual([manual.id]);
  });
});
