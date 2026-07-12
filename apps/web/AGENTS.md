# AGENTS.md — apps/web

## Propósito

Next.js App Router (deploy: Cloudflare Workers via OpenNext — doc 01 §1.1). Três superfícies: **painel** `app.atende-ai.com.br` (rotas `(painel)/`, tenant SEMPRE da sessão JWT), **booking pública white-label** `{slug}.atende-ai.com.br` (rotas `(publico)/[slug]/` — única superfície host→tenant), e **API/webhooks** (`api/v1/` versionada; `api/webhooks/*` valida assinatura e SÓ enfileira).

## Contratos

Toda Server Action valida input com schema Zod de `@atende/core`, resolve tenant da sessão JWT e executa sob `runWithTenant` (doc 09 §3.3). Rotas finas em `src/app/`; componentes e actions em `src/modules/<dominio>/`.

## Invariantes

1. Identidade do tenant vem **sempre da sessão JWT** — nunca de URL, input ou saída de IA (regra inviolável 3).
2. Webhook **não processa**: valida assinatura (HMAC/token) e enfileira no pg-boss. Zero lógica de negócio na borda.
3. Lógica de domínio vive em `@atende/core` — se um `if` de negócio está num `.tsx`, está no lugar errado.
4. Mutação via GET não existe.

## O que NUNCA fazer

- Nunca importar `@atende/canais` (normalização roda no worker — doc 09 §3.2) nem `@atende/db/unsafe`.
- Nunca acessar o banco fora de `runWithTenant` (exceção única: `resolverEmpresaPorSlug` da booking, que é interna ao `@atende/db`).
- Nunca criar rota fora dos grupos `(painel)`/`(publico)`/`api`.

## Dependências

Importa: `@atende/core`, `@atende/db`, `next`, `react`. Ninguém importa o web.

## Comandos

```bash
pnpm --filter @atende/web typecheck
pnpm --filter @atende/web build
```

## Estado atual

- [x] Skeleton App Router (layout + landing)
- [x] Auth: `/cadastro` (onboarding cria empresa+admin), `/login`, cookie de sessão (`lib/sessao.ts` — wrapper de next/headers sobre o JWT puro do core), Server Actions em `modules/identidade/actions.ts`
- [x] `(painel)/` protegido: layout checa sessão e redireciona; `/agenda` placeholder mostra tenant+escopos ativos
- [ ] OpenNext/wrangler (deploy Cloudflare — fim do Bloco 0)
- [ ] Seletor de empresa no login (quando houver usuário com 2+ vínculos); telas de RBAC/convites (config:usuarios)
- [ ] `(publico)/[slug]/` booking (Bloco 2), `api/webhooks/{meta,asaas}` (Blocos 3/5), `api/v1/` (Fase 2)
