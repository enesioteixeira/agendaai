import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Deploy alvo: Cloudflare Workers via OpenNext (doc 01 §1.1, doc 03).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Packages do monorepo são TS crus (sem build) — o Next transpila em runtime.
  transpilePackages: ["@atende/core", "@atende/db"],
  // Receita OpenNext Cloudflare (howtos/db): Prisma externo ao webpack — quem
  // resolve o entrypoint é o esbuild do OpenNext, com a condição "workerd"
  // ativa, escolhendo a variante WASM do client (ver o patch de reordenação em
  // packages/db/scripts/patch-prisma-workerd.mjs). pg externo pelo mesmo motivo.
  serverExternalPackages: ["@prisma/client", ".prisma/client", "@prisma/adapter-pg", "pg"],
  // O file-tracing do Next roda com condições Node e só copia os arquivos do
  // caminho Node do client — a variante workerd (wasm.js, loaders e o
  // query_compiler_bg.wasm) ficaria de fora e o bundle do OpenNext quebraria
  // com "Could not resolve". Inclui o diretório gerado inteiro (é pequeno).
  outputFileTracingIncludes: {
    "*": [
      "../../node_modules/.prisma/client/**/*",
      // Runtime da variante workerd (wasm.js requer wasm-compiler-edge).
      "../../node_modules/@prisma/client/runtime/wasm-*",
    ],
  },
};

// Expõe os bindings do Cloudflare (KV/R2/secrets) durante `next dev` local.
// No-op em produção/build de CI; envolto em try para não quebrar o build.
try {
  initOpenNextCloudflareForDev();
} catch {
  // ambiente sem contexto Cloudflare (ex.: CI puro) — ignorar
}

export default nextConfig;
