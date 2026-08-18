// E2E da medição de consumo contra Postgres real.
//
// Este arquivo existe porque as três coisas que podem quebrar aqui NÃO aparecem
// em teste puro: a transação que sobe trilha e agregado juntos, a chave composta
// do upsert convivendo com a extension de tenancy, e o isolamento entre tenants
// do que vira fatura. Consumo de um tenant contado no mês de outro é o pior
// defeito possível deste módulo — cobra de quem não usou.

import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

/** Empresa + plano + assinatura ativa. Plano é catálogo global: só via prismaSemTenant. */
async function montarTenantComPlano(
  sufixo: string,
  limiteConversasIaMes: number,
): Promise<{ empresaId: string }> {
  const { prismaSemTenant } = await import("../unsafe");

  const empresa = await prismaSemTenant.empresa.create({
    data: { slug: `uso-teste-${sufixo}`, nome: `Uso ${sufixo}`, vertical: "distribuidor_alimentos" },
  });
  const plano = await prismaSemTenant.planoLicenca.create({
    data: {
      chave: `uso-teste-${sufixo}`,
      nome: `Plano ${sufixo}`,
      precoMensalCentavos: 29900,
      limiteUsuarios: 5,
      limiteCanais: 1,
      limiteConversasIaMes,
      excedenteIaCentavos: 49,
    },
  });
  await prismaSemTenant.assinaturaPlataforma.create({
    data: { empresaId: empresa.id, planoId: plano.id, status: "ativa" },
  });

  return { empresaId: empresa.id };
}

describe.skipIf(!url)("plataforma — medição de consumo e teto", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = url;
  });

  it("duas execuções na mesma conversa são UMA conversa cobrada, com trilha completa", async () => {
    const { runWithTenant } = await import("../tenancy");
    const { registrarUsoDeIA, usoDoMes } = await import("./uso");
    const { prisma } = await import("../client");

    const { empresaId } = await montarTenantComPlano(`conv-${Date.now()}`, 1_500);
    const quando = new Date(Date.UTC(2026, 7, 17, 12, 0, 0));

    await runWithTenant({ empresaId }, async () => {
      const primeira = await registrarUsoDeIA({
        provedor: "gemini",
        modelo: "gemini-2.5-flash",
        uso: { entrada: 1_000_000, saida: 100_000 },
        conversaId: "conversa-a",
        quando,
      });
      const segunda = await registrarUsoDeIA({
        provedor: "gemini",
        modelo: "gemini-2.5-flash",
        uso: { entrada: 1_000_000, saida: 100_000 },
        conversaId: "conversa-a",
        quando: new Date(quando.getTime() + 60_000),
      });

      expect(primeira.contouConversa).toBe(true);
      expect(segunda.contouConversa).toBe(false);
      // 1M de entrada a 165 centavos/M + 100k de saída a 1375 centavos/M = 302,5 → 303.
      expect(primeira.custoCentavos).toBe(303);

      // Outra conversa, no mesmo mês, conta como segunda conversa.
      const outra = await registrarUsoDeIA({
        provedor: "gemini",
        modelo: "gemini-2.5-flash",
        uso: { entrada: 1_000, saida: 500 },
        conversaId: "conversa-b",
        quando,
      });
      expect(outra.contouConversa).toBe(true);

      const uso = await usoDoMes(quando);
      expect(uso.mesReferencia).toBe("2026-08");
      expect(uso.conversasIa).toBe(2);
      expect(uso.tokensEntrada).toBe(2_001_000);
      expect(uso.tokensSaida).toBe(200_500);

      // O agregado é EXATAMENTE a soma da trilha — é a conta que o tenant refaz
      // quando contesta a fatura.
      const trilha = await prisma.usoIA.findMany({ select: { custoEstimadoCentavos: true } });
      expect(trilha).toHaveLength(3);
      expect(uso.custoIaCentavos).toBe(
        trilha.reduce((soma, l) => soma + l.custoEstimadoCentavos, 0),
      );
    });
  });

  it("modelo fora da tabela usa o preço de desconhecido em vez de derrubar o turno", async () => {
    const { runWithTenant } = await import("../tenancy");
    const { registrarUsoDeIA } = await import("./uso");

    const { empresaId } = await montarTenantComPlano(`desconhecido-${Date.now()}`, 1_500);

    await runWithTenant({ empresaId }, async () => {
      const registro = await registrarUsoDeIA({
        provedor: "provedor-que-ninguem-cadastrou",
        modelo: "modelo-novo",
        uso: { entrada: 1_000_000, saida: 0 },
        conversaId: "conversa-x",
      });
      // Preço de desconhecido: 2750 centavos por milhão de entrada.
      expect(registro.custoCentavos).toBe(2750);
    });
  });

  it("consumo de um tenant não aparece no mês do outro", async () => {
    const { runWithTenant } = await import("../tenancy");
    const { registrarUsoDeIA, usoDoMes } = await import("./uso");

    const s = Date.now();
    const a = await montarTenantComPlano(`iso-a-${s}`, 1_500);
    const b = await montarTenantComPlano(`iso-b-${s}`, 1_500);
    const quando = new Date(Date.UTC(2026, 8, 3, 9, 0, 0));

    await runWithTenant({ empresaId: a.empresaId }, async () => {
      await registrarUsoDeIA({
        provedor: "anthropic",
        modelo: "claude-haiku-4-5",
        uso: { entrada: 500_000, saida: 50_000 },
        conversaId: "conversa-do-a",
        quando,
      });
    });

    const usoDeB = await runWithTenant({ empresaId: b.empresaId }, () => usoDoMes(quando));
    expect(usoDeB.conversasIa).toBe(0);
    expect(usoDeB.custoIaCentavos).toBe(0);

    const usoDeA = await runWithTenant({ empresaId: a.empresaId }, () => usoDoMes(quando));
    expect(usoDeA.conversasIa).toBe(1);
  });

  it("teto recusa quando a franquia do mês acaba, e o motivo diz o que continua funcionando", async () => {
    const { runWithTenant } = await import("../tenancy");
    const { registrarUsoDeIA, podeUsarIA } = await import("./uso");

    const { empresaId } = await montarTenantComPlano(`teto-${Date.now()}`, 2);
    const quando = new Date(Date.UTC(2026, 9, 10, 15, 0, 0));

    await runWithTenant({ empresaId }, async () => {
      const antes = await podeUsarIA(quando);
      expect(antes.permite).toBe(true);

      for (const conversaId of ["c1", "c2"]) {
        await registrarUsoDeIA({
          provedor: "gemini",
          modelo: "gemini-2.5-flash",
          uso: { entrada: 1_000, saida: 500 },
          conversaId,
          quando,
        });
      }

      const depois = await podeUsarIA(quando);
      expect(depois.permite).toBe(false);
      if (!depois.permite) {
        expect(depois.motivo).toContain("fila humana");
      }

      // Mês seguinte é outra franquia — o contador é por mês de competência.
      const outroMes = await podeUsarIA(new Date(Date.UTC(2026, 10, 1, 0, 0, 0)));
      expect(outroMes.permite).toBe(true);
    });
  });

  it("empresa sem assinatura não tem limites e não usa IA (fail-closed)", async () => {
    const { runWithTenant } = await import("../tenancy");
    const { limitesVigentes, podeUsarIA } = await import("./uso");
    const { prismaSemTenant } = await import("../unsafe");

    const empresa = await prismaSemTenant.empresa.create({
      data: {
        slug: `uso-teste-sem-plano-${Date.now()}`,
        nome: "Sem plano",
        vertical: "distribuidor_geral",
      },
    });

    await runWithTenant({ empresaId: empresa.id }, async () => {
      expect(await limitesVigentes()).toBeNull();
      const decisao = await podeUsarIA();
      expect(decisao.permite).toBe(false);
    });
  });

  it("assinatura cancelada não devolve limites", async () => {
    const { runWithTenant } = await import("../tenancy");
    const { limitesVigentes } = await import("./uso");
    const { prisma } = await import("../client");

    const { empresaId } = await montarTenantComPlano(`cancelada-${Date.now()}`, 1_500);

    await runWithTenant({ empresaId }, async () => {
      const vigente = await limitesVigentes();
      expect(vigente?.limiteConversasIaMes).toBe(1_500);

      await prisma.assinaturaPlataforma.updateMany({
        where: {},
        data: { status: "cancelada", canceladaEm: new Date() },
      });

      expect(await limitesVigentes()).toBeNull();
    });
  });
});
