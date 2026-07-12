# AGENTS.md — apps/worker

## Propósito

Node **sempre-ativo** (VM Ampere A1 na Oracle Cloud Always Free, Docker Compose): gestor dos N sockets Baileys (`Map<canalId, socket>`), consumidores pg-boss (inbound, lembretes, régua, e-mail, IA, outbox, retenção LGPD, plataforma) e hub SSE do painel de atendimento (doc 01 §1.3, doc 09).

## Contratos

Payloads de jobs pg-boss validados com os schemas Zod de `@atende/core` — o mesmo schema que valida o enqueue no web valida o consumo aqui (doc 09 §3.4).

## Invariantes

1. Todo consumer que toca dado de tenant roda sob `runWithTenant` (o job carrega `empresaId` no payload).
2. `unhandledRejection` é logada e engolida — rejection de socket Baileys não pode derrubar o processo (N tenants no mesmo worker; fix herdado do ev-tracker, doc 08 §3.2).
3. Reconexão de socket com backoff (2s × tentativas, teto 30s); auth-state no Postgres — a VM é descartável.
4. Entradas de rede: só `/healthz` e o hub SSE. Nenhuma outra porta.

## O que NUNCA fazer

- **Nunca** enviar proativo por socket Baileys (regra inviolável 12) — lembrete/régua saem pelo conector oficial ou e-mail.
- Nunca importar `@atende/db/unsafe` fora de `src/consumers/plataforma.ts` (allowlist doc 09 §3.2).
- Nunca processar webhook de forma síncrona — quem recebe é `apps/web`, que só enfileira.

## Dependências

Importa: `@atende/core`, `@atende/db`, `@atende/canais`, `pg-boss`. Ninguém importa o worker.

## Comandos

```bash
pnpm --filter @atende/worker typecheck
pnpm --filter @atende/worker build
pnpm --filter @atende/worker dev   # local; NÃO subir em produção fora do Docker
```

## Estado atual

- [x] Bootstrap: health server + pg-boss (inicia quando `DATABASE_URL` existir)
- [x] Dockerfile multi-stage
- [ ] `src/sockets/` — gestor Baileys `Map<canalId, socket>` (Bloco 3, port doc 08 §3.2)
- [ ] `src/consumers/` — inbound, lembretes, regua, email, ia, outbox, retencao-lgpd, plataforma (Blocos 3–6)
- [ ] `src/sse/` — hub do painel (Bloco 3)
