// E2E da booking pública (B4) contra Postgres real — critérios doc 04 §2.3:
// booking cria agendamento que aparece no painel do TENANT CERTO; slug de um
// tenant nunca expõe dados de outro; slot ocupado some da vitrine; corrida na
// escrita é decidida pelo banco (23P01).

import { describe, it, expect, beforeAll } from "vitest";

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

async function montarTenantBooking(sufixo: string) {
  const { prisma } = await import("../client");
  const { runWithTenant } = await import("../tenancy");
  const { prismaSemTenant } = await import("../unsafe");

  const empresa = await prismaSemTenant.empresa.create({
    data: { slug: `booking-teste-${sufixo}`, nome: `Booking ${sufixo}`, vertical: "salao" },
  });
  return runWithTenant({ empresaId: empresa.id }, async () => {
    const unidade = await prisma.unidade.create({ data: { nome: "Matriz" } as never });
    const profissional = await prisma.profissional.create({
      data: { nome: "Pro Booking", unidadeId: unidade.id } as never,
    });
    // trabalha todos os dias 09–18 (teste independe do dia da semana)
    await prisma.horarioTrabalho.createMany({
      data: Array.from({ length: 7 }, (_, d) => ({
        profissionalId: profissional.id,
        unidadeId: unidade.id,
        diaSemana: d,
        horaInicio: "09:00",
        horaFim: "18:00",
      })) as never,
    });
    const servico = await prisma.servico.create({
      data: { nome: "Corte Booking", duracaoMin: 60, precoCentavos: 8000 } as never,
    });
    return { empresa, unidade, profissional, servico };
  });
}

// dia de amanhã (sempre no futuro p/ o filtro "não oferecer passado")
function amanha(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!url)("B4 — booking pública E2E", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = url;
  });

  it("catálogo por slug isola tenants; slug inexistente → null", async () => {
    const { catalogoBooking } = await import("./booking");
    const s = Date.now();
    const a = await montarTenantBooking(`a-${s}`);
    const b = await montarTenantBooking(`b-${s}`);

    const catA = await catalogoBooking(a.empresa.slug);
    expect(catA?.empresa.empresaId).toBe(a.empresa.id);
    expect(catA?.servicos.map((x) => x.id)).toEqual([a.servico.id]);
    expect(catA?.profissionais.map((x) => x.id)).toEqual([a.profissional.id]);
    // nada do tenant B aparece pelo slug de A
    expect(catA?.servicos.some((x) => x.id === b.servico.id)).toBe(false);

    expect(await catalogoBooking("slug-que-nao-existe")).toBeNull();
  });

  it("fluxo completo: slots → agendar → aparece no painel do tenant certo → slot some", async () => {
    const { slotsBooking, criarAgendamentoBooking } = await import("./booking");
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");

    const s = Date.now();
    const t = await montarTenantBooking(`fluxo-${s}`);
    const data = amanha();

    const antes = await slotsBooking(t.empresa.slug, t.servico.id, t.profissional.id, data);
    expect(antes?.slots).toContain("10:00");

    const r = await criarAgendamentoBooking({
      slug: t.empresa.slug,
      servicoId: t.servico.id,
      profissionalId: t.profissional.id,
      data,
      hora: "10:00",
      clienteNome: "Cliente Booking",
      clienteTelefone: "11988887777",
    });
    expect(r.agendamentoId).toBeTruthy();

    // aparece no "painel" do tenant certo, com cliente provisório deduplicável
    const noPainel = await runWithTenant({ empresaId: t.empresa.id }, () =>
      prisma.agendamento.findUnique({
        where: { id: r.agendamentoId },
        include: { cliente: true },
      }),
    );
    expect(noPainel?.origem).toBe("booking");
    expect(noPainel?.cliente.provisorio).toBe(true);
    expect(noPainel?.cliente.telefone).toBe("11988887777");

    // o slot ocupado sai da vitrine (10:00–11:00 consome 09:30/10:00/10:30)
    const depois = await slotsBooking(t.empresa.slug, t.servico.id, t.profissional.id, data);
    expect(depois?.slots).not.toContain("10:00");
    expect(depois?.slots).not.toContain("09:30");
    expect(depois?.slots).toContain("09:00");

    // mesmo telefone de novo → dedup (não cria segundo cliente)
    await criarAgendamentoBooking({
      slug: t.empresa.slug,
      servicoId: t.servico.id,
      profissionalId: t.profissional.id,
      data,
      hora: "14:00",
      clienteNome: "Cliente Booking",
      clienteTelefone: "11988887777",
    });
    const clientes = await runWithTenant({ empresaId: t.empresa.id }, () =>
      prisma.cliente.findMany({ where: { telefone: "11988887777" } }),
    );
    expect(clientes).toHaveLength(1);
  });

  it("corrida: duas bookings simultâneas no mesmo slot → uma vence (banco decide)", async () => {
    const { criarAgendamentoBooking } = await import("./booking");
    const s = Date.now();
    const t = await montarTenantBooking(`corrida-${s}`);
    const data = amanha();

    const tentar = () =>
      criarAgendamentoBooking({
        slug: t.empresa.slug,
        servicoId: t.servico.id,
        profissionalId: t.profissional.id,
        data,
        hora: "11:00",
        clienteNome: "Corrida",
        clienteTelefone: `1197777${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`,
      });

    const resultados = await Promise.allSettled([tentar(), tentar()]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const perdedor = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(perdedor.reason)).toMatch(/23P01|sem_sobreposicao|exclusion/i);
  });
});
