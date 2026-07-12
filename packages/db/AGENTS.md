# AGENTS.md — packages/db

## Propósito

A **única porta para o banco** (Neon Postgres). Exporta o Prisma Client com a extension de tenancy (injeta `empresaId` em toda query/escrita via AsyncLocalStorage), o `runWithTenant` e o resolver `slug → empresaId` da booking. Schema e migrations vivem aqui.

## Contratos

- `prisma` (client com tenancy), `runWithTenant(ctx, fn)`, `contextoTenantAtual()` — `src/index.ts`.
- `prismaSemTenant` — **só** via `@atende/db/unsafe`, sob allowlist de lint (doc 09 §3.2).
- O desenho canônico do schema é `docs/02-modelo-de-dados.md` — o `schema.prisma` o materializa por bloco do roadmap.

## Invariantes

1. Toda query de dado de tenant roda **dentro de `runWithTenant`** — fora dele a extension lança erro (fail-closed).
2. Toda unicidade de dado de tenant é composta: `@@unique([empresaId, ...])` (exceções documentadas: `Usuario.email`, `Empresa.slug`, `Escopo.chave`).
3. `empresaId` divergente do contexto (em where ou data) é **erro**, nunca silenciosamente sobrescrito.
4. Models globais (sem `empresaId`) entram na allowlist `MODELS_GLOBAIS` de `src/client.ts` **no mesmo PR** que os cria no schema.
5. Constraints que o Prisma não expressa (exclusion da agenda, unique parcial de convite) vivem em **migration SQL manual** (`prisma migrate dev --create-only` + edição do `.sql`).

## O que NUNCA fazer

- **Nunca** `db push` — `prisma migrate` sempre (regra inviolável 13).
- **Nunca** exportar `prismaSemTenant` pelo `index.ts`.
- **Nunca** escrever `where: { empresaId }` à mão em código de app — a extension injeta.
- **Nunca** importar `./unsafe` fora da allowlist: interno a `packages/db` e `apps/worker/src/consumers/plataforma.ts`.

## Dependências

Importa: `@prisma/client`, `@prisma/adapter-pg`, `pg`. Importado por: `apps/web`, `apps/worker`. **Não** importa nenhum outro package do repo.

## Comandos

```bash
pnpm --filter @atende/db generate    # prisma generate
pnpm --filter @atende/db migrate     # prisma migrate dev
pnpm --filter @atende/db test        # vitest (isolamento exige DATABASE_URL_TEST)
pnpm --filter @atende/db typecheck
```

## Estado atual

- [x] Extension de tenancy (`client.ts`), `runWithTenant`, `unsafe.ts`, `resolver-slug.ts`
- [x] Schema: domínio `identidade` (doc 02 §2)
- [x] Teste de isolamento de tenant (roda com `DATABASE_URL_TEST`)
- [ ] Migration inicial (exige Neon provisionado — `DATABASE_URL`)
- [ ] Unique parcial de `ConviteUsuario` (migration SQL manual)
- [ ] Domínios `agenda`/`clientes` (Bloco 2), `atendimento` (Blocos 3–4), `financeiro` (Bloco 5), LGPD (Bloco 6)
