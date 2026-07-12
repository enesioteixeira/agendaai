# IDs de infraestrutura (não-sensíveis)

Identificadores públicos dos recursos de nuvem — usados em configs de deploy
(`wrangler.jsonc`, CI). **Não são segredos** (tokens/senhas ficam em GitHub
Secrets e no `.env` local, nunca aqui). Ver setup completo em `docs/10-setup-contas.md`.

## Cloudflare

| Recurso | Valor | Uso |
|---|---|---|
| Account ID | `c158973636514615cb24b9ff908147b1` | Wrangler / deploy do `apps/web` |
| KV namespace `atende-ai-config` | `e1860ad085fe4e21ab85e1fa8c84530f` | Cache de config de tenant por slug (doc 09) |
| R2 bucket | `atende-ai-midia` | Storage de mídia inbound (Bloco 3) |

## Neon

| Recurso | Valor | Uso |
|---|---|---|
| Região | AWS South America East 1 (São Paulo) | Menor latência BR |
| Branch | `production` | Banco principal (connection string em GitHub Secret `DATABASE_URL`) |
