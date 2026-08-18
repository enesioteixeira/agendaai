import { describe, expect, it } from "vitest";

/**
 * CATRACA CONTRA A SUÍTE QUE PASSA POR VACUIDADE.
 *
 * Todo e2e deste pacote abre com `describe.skipIf(!DATABASE_URL_TEST)`. Sem
 * essa variável, a suíte reporta **verde tendo pulado a camada de banco
 * inteira** — inclusive `isolamento.test.ts`, que é a prova da regra inviolável
 * 1 (a extension que injeta `empresaId` e impede um tenant de ler dados de
 * outro). Teste ausente é visível; teste pulado passa por cobertura.
 *
 * O `vitest.setup.ts` fechou a porta comum: com o ambiente local no ar, a
 * variável é preenchida sozinha a partir de `DATABASE_URL` e nada pula. Este
 * arquivo cobre o que sobrou — a máquina sem banco algum, onde o silêncio
 * verde volta a ser possível.
 *
 * Ele não testa código: testa a INTENÇÃO de rodar os testes. Com
 * `EXIGIR_DB_TEST=1`, a ausência de banco vira falha vermelha.
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
