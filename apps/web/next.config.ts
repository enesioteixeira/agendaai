import type { NextConfig } from "next";

// Deploy alvo: Cloudflare Workers via OpenNext (doc 01 §1.1, doc 03).
// O adapter (@opennextjs/cloudflare) e o wrangler.jsonc entram quando o
// deploy for configurado — o app roda igual em node até lá.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Packages do monorepo são TS crus (sem build) — o Next transpila em runtime.
  transpilePackages: ["@atende/core", "@atende/db"],
};

export default nextConfig;
