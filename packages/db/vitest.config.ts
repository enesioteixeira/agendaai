import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Cria o banco de teste e aplica as migrations — uma vez por rodada.
    globalSetup: ["./vitest.global-setup.ts"],
    // Roda em cada worker, ANTES de coletar os arquivos: o
    // `describe.skipIf(!DATABASE_URL_TEST)` no topo de cada e2e é avaliado na
    // importação do módulo, não na execução do teste.
    setupFiles: ["./vitest.setup.ts"],
  },
});
