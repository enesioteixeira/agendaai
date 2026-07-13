// E2E de convites contra Postgres real (DATABASE_URL_TEST): criar sob tenant,
// consultar por token, aceitar criando conta nova, sessão com escopos do papel
// convidado. Emails/slugs com padrão de teste — limpos por scripts/limpar-teste.mjs.

import { describe, it, expect, beforeAll } from "vitest";

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("Bloco 1 — convites E2E", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = url;
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "teste-secret";
  });

  it("ciclo completo: convidar → consultar → aceitar → sessão com escopos do papel", async () => {
    const { cadastroInicial } = await import("./onboarding");
    const { criarConvite, consultarConvite, aceitarConvite } = await import("./convites");
    const { montarSessao } = await import("./autenticacao");
    const { runWithTenant } = await import("../tenancy");
    const { prisma } = await import("../client");

    const s = Date.now();
    const dona = await cadastroInicial({
      nome: "Dona", email: `dona-conv-${s}@teste.com`, senha: "senha-forte-123",
      empresaNome: "Salão Convites", empresaSlug: `salao-teste-${s}`, vertical: "salao",
      unidadeNome: "Matriz", fusoHorario: "America/Sao_Paulo",
    });

    // papel Recepcionista do tenant
    const papeis = await runWithTenant({ empresaId: dona.empresaId }, () => prisma.papel.findMany());
    const recepcionista = papeis.find((p) => p.nome === "Recepcionista");
    expect(recepcionista).toBeDefined();

    // convidar (sob o tenant)
    const emailConvidado = `recep-${s}@teste.com`;
    const convite = await runWithTenant({ empresaId: dona.empresaId }, () =>
      criarConvite({ email: emailConvidado, papelId: recepcionista!.id, unidadesPermitidas: [] }),
    );
    expect(convite.token).toHaveLength(64); // 32 bytes hex

    // consultar por token (pré-tenant)
    const publico = await consultarConvite(convite.token);
    expect(publico?.empresaNome).toBe("Salão Convites");
    expect(publico?.papelNome).toBe("Recepcionista");
    expect(publico?.emailJaCadastrado).toBe(false);

    // token errado não resolve
    expect(await consultarConvite("a".repeat(64))).toBeNull();

    // aceitar criando conta nova
    const aceite = await aceitarConvite(convite.token, { nome: "Recep", senha: "senha-nova-123" });
    expect(aceite?.empresaId).toBe(dona.empresaId);

    // sessão do convidado traz os 10 escopos de Recepcionista (matriz doc 02 §13)
    const sessao = await montarSessao(aceite!.usuarioId, dona.empresaId);
    expect(sessao?.escopos).toHaveLength(10);
    expect(sessao?.escopos).toContain("financeiro:cobrar");
    expect(sessao?.escopos).not.toContain("config:usuarios");

    // aceite duplo falha (status já aceito)
    expect(await aceitarConvite(convite.token, { nome: "X", senha: "senha-qualquer-1" })).toBeNull();
  });

  it("reenvio revoga o pendente anterior (unique parcial nunca viola)", async () => {
    const { cadastroInicial } = await import("./onboarding");
    const { criarConvite, consultarConvite } = await import("./convites");
    const { runWithTenant } = await import("../tenancy");

    const s = Date.now();
    const r = await cadastroInicial({
      nome: "D2", email: `dona2-${s}@teste.com`, senha: "senha-forte-123",
      empresaNome: "Emp Reenvio", empresaSlug: `emp-a-${s}`, vertical: "barbearia",
      unidadeNome: "Matriz", fusoHorario: "America/Sao_Paulo",
    });

    const email = `duplo-${s}@teste.com`;
    const c1 = await runWithTenant({ empresaId: r.empresaId }, () =>
      criarConvite({ email, papelId: r.papelAdminId, unidadesPermitidas: [] }),
    );
    const c2 = await runWithTenant({ empresaId: r.empresaId }, () =>
      criarConvite({ email, papelId: r.papelAdminId, unidadesPermitidas: [] }),
    );

    // o primeiro token morreu; só o segundo resolve
    expect(await consultarConvite(c1.token)).toBeNull();
    expect(await consultarConvite(c2.token)).not.toBeNull();
  });
});
