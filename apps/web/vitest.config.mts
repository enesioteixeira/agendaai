import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // O mesmo apelido do `tsconfig.json`. O vitest não lê `paths` do tsconfig,
    // e sem isto nenhum teste consegue importar um módulo que use `@/…` — que
    // é todo o código de `src/`, inclusive as Server Actions.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
