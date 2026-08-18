import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Roda ANTES de coletar os arquivos, que é o que importa: o
    // `describe.skipIf(!DATABASE_URL_TEST)` no topo de cada e2e é avaliado na
    // importação do módulo, não na execução do teste.
    setupFiles: ["./vitest.setup.ts"],
  },
});
