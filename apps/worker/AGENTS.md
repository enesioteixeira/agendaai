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
- [x] **Bloco 3.3**: `src/sockets/` — gestor Baileys `Map<canalId, socket>` com reconciliação a cada 15s (abre canais novos, fecha removidos), reconexão backoff 2s×n (teto 30s), auth-state cifrado no Postgres (`auth-state-pg.ts` — logout limpa e volta a parear), QR cifrado em `Canal.configCifrada` + status `pareando` (o painel decifra e exibe). `src/consumers/`: `plataforma.ts` (leituras cross-tenant allowlistadas: canais ativos + saídas pendentes), `inbound.ts` (identidade→cliente provisório→conversa `fila_humano`→mensagem com dedup), `outbox-envio.ts` (varre `Mensagem` `pendente` de saída a cada 3s, claim atômico por tenant, envia pelo conector, `falhou` em erro). **Sem SSE por ora**: worker roda na máquina local (doc 11) — painel usa polling; hub SSE entra quando houver host público.
- [ ] Consumers dos motores: lembretes, régua, e-mail, IA (pg-boss — Blocos 4–5); retenção LGPD (Bloco 6)

## Rodar local (Bloco 3)

```bash
pnpm --filter @atende/worker dev
```
O bootstrap carrega `apps/worker/.env` (gitignored) automaticamente — precisa de `DATABASE_URL` (Neon) e `ENCRYPTION_KEY` (a **MESMA** do Worker web: auth-state/QR cifrados aqui são decifrados lá). Variável já definida no ambiente tem precedência sobre o arquivo.
Criou canal no painel (/configuracoes/canais) → o worker detecta em ≤15s → QR aparece no painel → escanear no WhatsApp (Aparelhos conectados). Mensagens recebidas viram conversas em `fila_humano`; respostas do painel saem pela outbox (≤3s).
