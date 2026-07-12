import type { NextConfig } from "next";

// Deploy alvo: Cloudflare Workers via OpenNext (doc 01 §1.1, doc 03).
// O adapter (@opennextjs/cloudflare) e o wrangler.jsonc entram quando o
// deploy for configurado — o app roda igual em node até lá.
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
