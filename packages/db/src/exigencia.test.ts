import { describe, expect, it } from "vitest";

/**
 * CATRACA CONTRA A SUÍTE QUE PASSA POR VACUIDADE.
 *
 * Todos os 7 arquivos de teste deste pacote abrem com
 * `describe.skipIf(!DATABASE_URL_TEST)`. Sem essa variável, `pnpm test` reporta
 * **verde tendo pulado 100% da camada de banco** — incluindo `isolamento.test.ts`,
 * que é a prova da regra inviolável 1 (a extension que injeta `empresaId` e
 * impede um tenant de ler dados de outro).
 *
 * Isso é pior do que não ter teste: um teste ausente é visível, um teste pulado
 * parece cobertura. Com o CI desativado (conta billing-locked), a garantia de
 * isolamento multi-tenant passou a depender de alguém lembrar de exportar uma
 * variável de ambiente.
 *
 * Este arquivo não testa código — testa a INTENÇÃO de rodar os testes. Quando
 * `EXIGIR_DB_TEST=1`, a ausência de `DATABASE_URL_TEST` vira falha vermelha em
 * vez de silêncio verde.
 *
 * Use assim antes de mexer em `client.ts`, `tenancy.ts` ou no schema:
 *
 *     EXIGIR_DB_TEST=1 pnpm --filter @atende/db test
 */
describe("exigência de banco de teste", () => {
  it("com EXIGIR_DB_TEST=1, a suíte não pode rodar sem DATABASE_URL_TEST", () => {
    if (process.env.EXIGIR_DB_TEST !== "1") {
      // Sem a exigência ligada, este teste não opina — é o modo do dia a dia,
      // em que rodar sem banco é aceitável.
      expect(true).toBe(true);
      return;
    }

    const url = process.env.DATABASE_URL_TEST;
    expect(
      url,
      "EXIGIR_DB_TEST=1 mas DATABASE_URL_TEST não está definida — os testes de " +
        "isolamento de tenant seriam PULADOS e a suíte passaria sem provar nada. " +
        "Aponte para um branch descartável do Neon (nunca produção).",
    ).toBeTruthy();

    // Guarda de segurança: o banco de teste é destrutivo por natureza (cria e
    // apaga tenants). Apontá-lo para produção destruiria dados reais — e já
    // houve um incidente exatamente assim neste projeto.
    expect(
      url?.includes("ep-weathered-base"),
      "DATABASE_URL_TEST aponta para o banco de desenvolvimento/produção. " +
        "Use um branch separado do Neon.",
    ).toBe(false);
  });
});
