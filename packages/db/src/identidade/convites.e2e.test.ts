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
    expect(aceite.ok).toBe(true);
    if (!aceite.ok) throw new Error("inesperado");
    expect(aceite.empresaId).toBe(dona.empresaId);

    // sessão do convidado traz os 10 escopos de Recepcionista (matriz doc 02 §13)
    const sessao = await montarSessao(aceite.usuarioId, dona.empresaId);
    expect(sessao?.escopos).toHaveLength(10);
    expect(sessao?.escopos).toContain("financeiro:cobrar");
    expect(sessao?.escopos).not.toContain("config:usuarios");

    // aceite duplo falha limpo (claim atômico já consumiu o convite)
    const duplo = await aceitarConvite(convite.token, { nome: "X", senha: "senha-qualquer-1" });
    expect(duplo).toEqual({ ok: false, motivo: "invalido" });
  });

  it("conta existente exige a senha DO DONO (o link não é credencial)", async () => {
    const { cadastroInicial } = await import("./onboarding");
    const { criarConvite, aceitarConvite } = await import("./convites");
    const { montarSessao } = await import("./autenticacao");
    const { runWithTenant } = await import("../tenancy");
    const { prisma } = await import("../client");

    const s = Date.now();
    // vítima tem conta própria (tenant A)
    const vitima = await cadastroInicial({
      nome: "Vitima", email: `vitima-${s}@teste.com`, senha: "senha-da-vitima-1",
      empresaNome: "Tenant Vitima", empresaSlug: `salao-teste-v${s}`, vertical: "salao",
      unidadeNome: "Matriz", fusoHorario: "America/Sao_Paulo",
    });
    // atacante (tenant B) convida o e-mail da vítima
    const atacante = await cadastroInicial({
      nome: "Atacante", email: `atacante-${s}@teste.com`, senha: "senha-do-atacante-1",
      empresaNome: "Tenant Atacante", empresaSlug: `salao-teste-a${s}`, vertical: "barbearia",
      unidadeNome: "Matriz", fusoHorario: "America/Sao_Paulo",
    });
    const papeisB = await runWithTenant({ empresaId: atacante.empresaId }, () => prisma.papel.findMany());
    const convite = await runWithTenant({ empresaId: atacante.empresaId }, () =>
      criarConvite({ email: `vitima-${s}@teste.com`, papelId: papeisB[0]!.id, unidadesPermitidas: [] }),
    );

    // atacante tem o link mas NÃO a senha da vítima → não vira sessão dela
    const semSenha = await aceitarConvite(convite.token, {});
    expect(semSenha).toEqual({ ok: false, motivo: "dados_incompletos" });
    const senhaErrada = await aceitarConvite(convite.token, { senha: "senha-do-atacante-1" });
    expect(senhaErrada).toEqual({ ok: false, motivo: "senha_incorreta" });

    // a própria vítima, com a senha dela, aceita e ganha o 2º vínculo
    const aceite = await aceitarConvite(convite.token, { senha: "senha-da-vitima-1" });
    expect(aceite.ok).toBe(true);
    if (!aceite.ok) throw new Error("inesperado");
    expect(aceite.usuarioId).toBe(vitima.usuarioId);
    const sessaoB = await montarSessao(vitima.usuarioId, atacante.empresaId);
    expect(sessaoB).not.toBeNull();
  });

  it("criarConvite recusa membro ativo e papel de outro tenant", async () => {
    const { cadastroInicial } = await import("./onboarding");
    const { criarConvite } = await import("./convites");
    const { runWithTenant } = await import("../tenancy");
    const { prisma } = await import("../client");

    const s = Date.now();
    const a = await cadastroInicial({
      nome: "AdminA", email: `admina-${s}@teste.com`, senha: "senha-forte-123",
      empresaNome: "Tenant A", empresaSlug: `emp-a-g${s}`, vertical: "salao",
      unidadeNome: "Matriz", fusoHorario: "America/Sao_Paulo",
    });
    const b = await cadastroInicial({
      nome: "AdminB", email: `adminb-${s}@teste.com`, senha: "senha-forte-123",
      empresaNome: "Tenant B", empresaSlug: `emp-b-g${s}`, vertical: "advocacia",
      unidadeNome: "Sede", fusoHorario: "America/Sao_Paulo",
    });

    // convite para quem já é membro ativo (o próprio admin) → recusado
    await expect(
      runWithTenant({ empresaId: a.empresaId }, () =>
        criarConvite({ email: `admina-${s}@teste.com`, papelId: a.papelAdminId, unidadesPermitidas: [] }),
      ),
    ).rejects.toThrow(/já é membro ativo/);

    // convite usando papelId do tenant B dentro do tenant A → recusado
    const papeisB = await runWithTenant({ empresaId: b.empresaId }, () => prisma.papel.findMany());
    await expect(
      runWithTenant({ empresaId: a.empresaId }, () =>
        criarConvite({ email: `alguem-${s}@teste.com`, papelId: papeisB[0]!.id, unidadesPermitidas: [] }),
      ),
    ).rejects.toThrow(/Papel inválido/);
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
