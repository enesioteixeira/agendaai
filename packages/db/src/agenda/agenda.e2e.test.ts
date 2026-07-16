// Teste E2E do Bloco 2 (agenda) contra Postgres real (DATABASE_URL_TEST,
// fallback DATABASE_URL como os demais E2E). Cobre:
//   1. isolamento de tenant da cadeia da agenda (critério doc 04 §2.8);
//   2. exclusion constraint anti-sobreposição — o critério de pronto do
//      Bloco 2: duas escritas simultâneas no mesmo horário/profissional →
//      exatamente uma vence, a outra recebe o conflito DO BANCO (23P01);
//   3. encaixe perfeito de grade ('[)') e liberação de horário por status.
// Dados de teste: slugs com "-teste-" (limpar-teste.mjs remove).

import { describe, it, expect, beforeAll } from "vitest";

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

// Cadeia mínima da agenda para um tenant novo (empresa → unidade →
// profissional/serviço/cliente), criada sob o contexto do próprio tenant.
async function montarCadeia(sufixo: string) {
  const { prisma } = await import("../client");
  const { runWithTenant } = await import("../tenancy");
  const { prismaSemTenant } = await import("../unsafe");

  const empresa = await prismaSemTenant.empresa.create({
    data: { slug: `agenda-teste-${sufixo}`, nome: `Agenda ${sufixo}`, vertical: "salao" },
  });

  return runWithTenant({ empresaId: empresa.id }, async () => {
    const unidade = await prisma.unidade.create({ data: { nome: "Matriz" } as never });
    const profissional = await prisma.profissional.create({
      data: { nome: "Pro Teste", unidadeId: unidade.id } as never,
    });
    const servico = await prisma.servico.create({
      data: { nome: "Corte", duracaoMin: 60, precoCentavos: 5000 } as never,
    });
    const cliente = await prisma.cliente.create({
      data: { nome: "Cliente Teste", telefone: "+5511999990000" } as never,
    });
    return { empresa, unidade, profissional, servico, cliente };
  });
}

describe.skipIf(!url)("Bloco 2 — agenda E2E", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = url;
  });

  it("cadeia da agenda de um tenant é invisível para outro (inclui AuditLog)", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");
    const { prismaSemTenant } = await import("../unsafe");

    const s = Date.now();
    const a = await montarCadeia(`a-${s}`);
    const b = await prismaSemTenant.empresa.create({
      data: { slug: `agenda-teste-b-${s}`, nome: "Tenant B", vertical: "barbearia" },
    });

    await runWithTenant({ empresaId: a.empresa.id }, async () => {
      await prisma.agendamento.create({
        data: {
          unidadeId: a.unidade.id,
          clienteId: a.cliente.id,
          profissionalId: a.profissional.id,
          servicoId: a.servico.id,
          inicio: new Date("2030-01-15T14:00:00Z"),
          fim: new Date("2030-01-15T15:00:00Z"),
          origem: "painel",
        } as never,
      });
      await prisma.auditLog.create({
        data: { acao: "criar", entidade: "Agendamento", entidadeId: "x" } as never,
      });
    });

    const vistosPorB = await runWithTenant({ empresaId: b.id }, async () => ({
      agendamentos: await prisma.agendamento.findMany(),
      servicos: await prisma.servico.findMany(),
      profissionais: await prisma.profissional.findMany(),
      clientes: await prisma.cliente.findMany(),
      auditoria: await prisma.auditLog.findMany(),
    }));
    expect(vistosPorB.agendamentos).toHaveLength(0);
    expect(vistosPorB.servicos).toHaveLength(0);
    expect(vistosPorB.profissionais).toHaveLength(0);
    expect(vistosPorB.clientes).toHaveLength(0);
    expect(vistosPorB.auditoria).toHaveLength(0);
  });

  it("corrida: duas escritas sobrepostas no mesmo profissional → exatamente uma vence (23P01 do banco)", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");

    const s = Date.now();
    const c = await montarCadeia(`corrida-${s}`);

    const criar = (minutoInicio: number) =>
      runWithTenant({ empresaId: c.empresa.id }, () =>
        prisma.agendamento.create({
          data: {
            unidadeId: c.unidade.id,
            clienteId: c.cliente.id,
            profissionalId: c.profissional.id,
            servicoId: c.servico.id,
            inicio: new Date(Date.UTC(2030, 1, 10, 14, minutoInicio)),
            fim: new Date(Date.UTC(2030, 1, 10, 15, minutoInicio)),
            origem: "booking",
          } as never,
        }),
      );

    // Sobreposição parcial (14:00–15:00 × 14:30–15:30), disparo simultâneo
    const resultados = await Promise.allSettled([criar(0), criar(30)]);
    const vencedores = resultados.filter((r) => r.status === "fulfilled");
    const perdedores = resultados.filter((r) => r.status === "rejected");
    expect(vencedores).toHaveLength(1);
    expect(perdedores).toHaveLength(1);
    // O conflito vem do BANCO (exclusion constraint), não da aplicação
    const motivo = String((perdedores[0] as PromiseRejectedResult).reason);
    expect(motivo).toMatch(/23P01|sem_sobreposicao|exclusion/i);
  });

  it("encaixe perfeito não colide ('[)'); cancelado libera o horário", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");

    const s = Date.now();
    const c = await montarCadeia(`grade-${s}`);

    await runWithTenant({ empresaId: c.empresa.id }, async () => {
      const base = {
        unidadeId: c.unidade.id,
        clienteId: c.cliente.id,
        profissionalId: c.profissional.id,
        servicoId: c.servico.id,
        origem: "painel",
      };
      // 14:00–15:00 e 15:00–16:00 — fim aberto, encaixe de grade permitido
      const primeiro = await prisma.agendamento.create({
        data: {
          ...base,
          inicio: new Date("2030-03-01T14:00:00Z"),
          fim: new Date("2030-03-01T15:00:00Z"),
        } as never,
      });
      await prisma.agendamento.create({
        data: {
          ...base,
          inicio: new Date("2030-03-01T15:00:00Z"),
          fim: new Date("2030-03-01T16:00:00Z"),
        } as never,
      });

      // Mesmo horário do primeiro → conflito enquanto ele está vivo
      await expect(
        prisma.agendamento.create({
          data: {
            ...base,
            inicio: new Date("2030-03-01T14:00:00Z"),
            fim: new Date("2030-03-01T15:00:00Z"),
          } as never,
        }),
      ).rejects.toThrow(/23P01|sem_sobreposicao|exclusion/i);

      // Cancelou → o predicado por status libera o horário sem delete
      await prisma.agendamento.update({
        where: { id: primeiro.id },
        data: { status: "cancelado", canceladoEm: new Date() },
      });
      const reocupado = await prisma.agendamento.create({
        data: {
          ...base,
          inicio: new Date("2030-03-01T14:00:00Z"),
          fim: new Date("2030-03-01T15:00:00Z"),
        } as never,
      });
      expect(reocupado.id).toBeTruthy();
    });
  });
});
