import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Config padrão do adapter Cloudflare. Cache incremental/tags podem ser
// plugados aqui (KV/R2/D1) quando ISR entrar em cena — no MVP o painel é
// dinâmico (cookies/DB por request), então o default basta.
export default defineCloudflareConfig();
