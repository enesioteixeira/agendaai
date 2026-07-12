// Teste E2E do Bloco 1 contra Postgres real (DATABASE_URL_TEST). Exercita o
// ciclo: cadastro inicial → montar sessão com escopos → login → isolamento.
// Sem a env, é pulado (no CI roda com Postgres efêmero).

import { describe, it, expect, beforeAll } from "vitest";

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

describe.skipIf(!url)("Bloco 1 — identidade E2E", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = url;
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "0".repeat(64);
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "teste-secret";
  });

  it("cadastro cria empresa+admin+papéis; sessão traz 24 escopos; login confere senha", async () => {
    const { cadastroInicial } = await import("./onboarding");
    const { autenticar, montarSessao } = await import("./autenticacao");

    const sufixo = Date.now();
    const r = await cadastroInicial({
      nome: "Dona do Salão",
      email: `dona-${sufixo}@teste.com`,
      senha: "senha-forte-123",
      empresaNome: "Salão Teste",
      empresaSlug: `salao-teste-${sufixo}`,
      vertical: "salao",
      unidadeNome: "Matriz",
      fusoHorario: "America/Sao_Paulo",
    });
    expect(r.empresaId).toBeTruthy();
    expect(r.papelAdminId).toBeTruthy();

    // Admin recebe todos os 24 escopos do catálogo
    const sessao = await montarSessao(r.usuarioId, r.empresaId);
    expect(sessao).not.toBeNull();
    expect(sessao?.escopos).toContain("config:empresa");
    expect(sessao?.escopos.length).toBe(24);

    // Login com senha certa funciona; senha errada não
    const ok = await autenticar({ email: `dona-${sufixo}@teste.com`, senha: "senha-forte-123" });
    expect(ok?.vinculos[0]?.empresaId).toBe(r.empresaId);
    const errado = await autenticar({ email: `dona-${sufixo}@teste.com`, senha: "errada" });
    expect(errado).toBeNull();
  });

  it("dois cadastros geram tenants isolados (mesmo papel canônico, ids distintos)", async () => {
    const { cadastroInicial } = await import("./onboarding");
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");

    const s = Date.now();
    const a = await cadastroInicial({
      nome: "A", email: `a-${s}@t.com`, senha: "senha-forte-123",
      empresaNome: "Empresa A", empresaSlug: `emp-a-${s}`, vertical: "barbearia",
      unidadeNome: "Matriz", fusoHorario: "America/Sao_Paulo",
    });
    const b = await cadastroInicial({
      nome: "B", email: `b-${s}@t.com`, senha: "senha-forte-123",
      empresaNome: "Empresa B", empresaSlug: `emp-b-${s}`, vertical: "advocacia",
      unidadeNome: "Sede", fusoHorario: "America/Sao_Paulo",
    });

    // Sob o tenant A, só se vê os papéis de A
    const papeisA = await runWithTenant({ empresaId: a.empresaId }, () => prisma.papel.findMany());
    expect(papeisA).toHaveLength(4);
    expect(papeisA.every((p) => p.empresaId === a.empresaId)).toBe(true);

    // O papel "Advogado" (só da vertical advocacia, tenant B) não vaza para A
    expect(papeisA.some((p) => p.nome === "Advogado")).toBe(false);
    const papeisB = await runWithTenant({ empresaId: b.empresaId }, () => prisma.papel.findMany());
    expect(papeisB.some((p) => p.nome === "Advogado")).toBe(true);
  });
});
