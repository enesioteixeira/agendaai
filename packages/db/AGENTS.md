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

## Armadilha crítica — AsyncLocalStorage + PrismaPromise lazy

`runWithTenant` faz `await fn()` DENTRO do `storage.run` de propósito: a PrismaPromise é lazy (a query e a extension só disparam no `.then()`). Se o `.then()` acontecer fora do `run`, o `empresaId` se perde e a query vaza entre tenants. **Nunca** simplifique `runWithTenant` para `return storage.run(ctx, fn)` cru — o teste de isolamento pega, mas o custo é um vazamento de tenant. Fluxos pré-tenant (onboarding, login) usam `prismaSemTenant` e carimbam `empresaId` à mão.

## Estado atual

- [x] Extension de tenancy (`client.ts`), `runWithTenant` (com fix do AsyncLocalStorage), `unsafe.ts`, `resolver-slug.ts`
- [x] Schema + **migration inicial aplicada no Neon**: domínio `identidade` (doc 02 §2)
- [x] Serviços de identidade: `onboarding.ts` (cadastro transacional empresa+admin+papéis+escopos), `autenticacao.ts` (login + montar sessão com escopos), `convites.ts` (token 32 bytes com SHA-256 no banco, aceite transacional idempotente, reenvio revoga anterior)
- [x] Unique parcial de `ConviteUsuario` (migration SQL manual `convite_unique_parcial`)
- [x] Teste de isolamento + E2E de identidade e convites **passando contra o Neon real** (7/7)
- [x] **Bloco 2 (schema)**: domínio `agenda` completo (doc 02 §3), `Cliente` mínimo (§4) e os **5 models LGPD** (§11 — devidos desde o Bloco 0). Migration `agenda_clientes_lgpd` com SQL manual: `btree_gist` + 2 exclusion constraints anti-sobreposição (profissional e recurso, predicado por status) + índice parcial de busca de clientes. E2E `src/agenda/agenda.e2e.test.ts`: isolamento da cadeia, corrida de double-booking (23P01 do banco) e encaixe `[)` — passando contra o Neon real.
- [x] **B4 (booking)**: `src/agenda/booking.ts` — `catalogoBooking`/`slotsBooking`/`criarAgendamentoBooking`, todos partindo de `resolverEmpresaPorSlug` e rodando sob `runWithTenant`. E2E `booking.e2e.test.ts` (isolamento entre slugs, fluxo completo com dedup de cliente provisório, corrida 23P01) contra o Neon real.
- [ ] `IdentidadeCanal`/`NotaCliente`/`Tag` (Bloco 3), `atendimento` (Blocos 3–4), `financeiro` (Bloco 5), superfície LGPD self-service (Bloco 6)

## Armadilha — `prisma migrate dev` desfaz o patch workerd

O `generate` do package roda `prisma generate` **e** `scripts/patch-prisma-workerd.mjs` (reordena as condições de exports/imports do client gerado — sem isso o bundle do OpenNext pega o entry Node e quebra no Worker com `fs.readFileSync is not implemented`). O `prisma migrate dev` regenera o client por conta própria **sem o patch** — depois de qualquer migrate, rode `pnpm generate` (ou o script do patch) antes de `cf:build`. O build do Workers Builds sempre roda `pnpm -w db:generate`, então o deploy nunca sai sem o patch.

## Pendências conscientes (revisão adversarial do Bloco 1)

- **Invalidação de JWT (7 dias)**: vínculo desativado/papel trocado só surte efeito no próximo login. Estratégia documentada (doc 02 §13: versão de vínculo força refresh) — implementar junto com o middleware de sessão do Bloco 2.
- **Posse do e-mail em convite de conta NOVA**: sem módulo de e-mail, o link é entregue ao convidador — quem aceita define a senha. Conta EXISTENTE já exige a senha do dono (corrigido). A prova de posse do e-mail chega com o envio automático (Fase D).
