import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Deploy alvo: Cloudflare Workers via OpenNext (doc 01 §1.1, doc 03).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Packages do monorepo são TS crus (sem build) — o Next transpila em runtime.
  transpilePackages: ["@atende/core", "@atende/db"],
  // pg, Prisma e Baileys usam APIs de Node — externalizar do bundle do server.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
};

// Expõe os bindings do Cloudflare (KV/R2/secrets) durante `next dev` local.
// No-op em produção/build de CI; envolto em try para não quebrar o build.
try {
  initOpenNextCloudflareForDev();
} catch {
  // ambiente sem contexto Cloudflare (ex.: CI puro) — ignorar
}

export default nextConfig;
