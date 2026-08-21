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
pnpm --filter @atende/worker build   # bundle esbuild → dist/index.js (ver build.mjs)
pnpm --filter @atende/worker start   # roda o bundle, igual ao container
pnpm --filter @atende/worker dev     # local, via tsx
```

### Por que o build é bundle e não emit do tsc

O monorepo usa resolução `bundler` em todo lugar (tsconfig.base), porque o `apps/web` consome os packages como TS cru via `transpilePackages` — um regime só evita o conflito do doc 11. O efeito colateral é que **o emit do tsc não serve para produção**: ele não põe extensão nos imports relativos e resolve `@atende/*` para o *fonte* TypeScript, então `node dist/index.js` morria com `ERR_UNKNOWN_FILE_EXTENSION` tentando carregar `packages/core/src/index.ts`. E emitia em `dist/apps/worker/src/`, não em `dist/` — o `CMD` do Dockerfile apontava para um caminho inexistente.

`build.mjs` resolve com um bundle único: o código do repositório entra no arquivo, tudo que vem de `node_modules` fica externo e é resolvido em runtime. A regra de externo é por origem, não por lista — dependência nova não exige tocar no build.

## Estado atual

- [x] Bootstrap: health server + pg-boss (inicia quando `DATABASE_URL` existir)
- [x] **Container que de fato sobe** (E0 do plano): build por bundle esbuild, `CMD` apontando para o arquivo certo e `HEALTHCHECK` no `/healthz`. Verificado nativamente — `node dist/index.js` sobe health, fila e gestor de sockets. **Falta subir a imagem numa VM**: enquanto isso não acontecer, o produto continua dependendo da máquina de quem desenvolve estar ligada, e é isso que precede qualquer conversa comercial
- [x] **Bloco 3.3**: `src/sockets/` — gestor Baileys `Map<canalId, socket>` com reconciliação a cada 15s (abre canais novos, fecha removidos), reconexão backoff 2s×n (teto 30s), auth-state cifrado no Postgres (`auth-state-pg.ts` — logout limpa e volta a parear), QR cifrado em `Canal.configCifrada` + status `pareando` (o painel decifra e exibe). `src/consumers/`: `plataforma.ts` (leituras cross-tenant allowlistadas: canais ativos + saídas pendentes), `inbound.ts` (identidade→cliente provisório→conversa `fila_humano`→mensagem com dedup), `outbox-envio.ts` (varre `Mensagem` `pendente` de saída a cada 3s, claim atômico por tenant, envia pelo conector, `falhou` em erro). **Sem SSE por ora**: worker roda na máquina local (doc 11) — painel usa polling; hub SSE entra quando houver host público.
- [x] **Fase B — recibos de entrega**: `consumers/recibos.ts` aplica os recibos do evento `messages.update` (✓ → ✓✓ → lida) casando por `idExterno`. As regras de ordem são puras e vivem em `@atende/canais/acks` — aqui fica só o encontro com o banco. Lê antes de escrever para não deixar um `entregue` atrasado desfazer um `lida` já gravado
- [x] **Fase B — reenvio** (`consumers/reenvio.ts`): até 3 tentativas com espera 0/2s/8s dentro do próprio envio. Antes, uma oscilação de rede de dois segundos matava a mensagem do atendente na primeira exceção. Só erro **transitório** repete — recusa definitiva (número não existe, JID inválido, socket morto) vai direto a `falhou`, porque repetir só atrasa o que o atendente precisa ver
- [x] **Fase B — watchdog** (`sockets/vigia.ts` + `derrubarZumbis` no gestor): socket que nunca conectou e ficou 5 min em silêncio absoluto é derrubado, e a reconciliação seguinte o reabre em ≤15 s lendo o auth-state do Postgres. **Diferente do ev-tracker, não mata o processo**: lá existe um socket só, aqui um por tenant — `process.exit(1)` derrubaria o atendimento de todos os outros. Canal esperando o QR ser escaneado não é zumbi: ele renova o sinal a cada QR emitido
- [ ] Consumers dos motores: lembretes, régua, e-mail, IA (pg-boss — Blocos 4–5); retenção LGPD (Bloco 6)
- [ ] **Fase B pendente**: mídia (download → R2) está **bloqueada por infra** — o binding R2 não existe no `wrangler.jsonc` (comentado desde o Bloco 0: exigiria permissão R2 no token). Sem o bucket, `normalizarInboundBaileys` continua devolvendo `midia: []` e a timeline mostra "Mensagem de imagem" em vez do arquivo

## O claim do outbox — dívida paga em 2026-08-21

Era assim: o claim marcava `enviada` **antes** de o conector enviar, e o enum não tinha estado intermediário. Morrer entre o claim e o envio deixava a mensagem `enviada` sem ter saído — perda silenciosa, com ✓ na tela do atendente.

Agora o claim reserva em **`enviando`** com carimbo (`Mensagem.envioReservadoEm`), e só o sucesso do conector promove a `enviada` — na **mesma escrita** que grava o `idExterno`, o que de quebra fechou a janela em que um recibo chegava antes de existir a quem pertencer.

Reserva órfã — worker que não voltou — é varrida a cada ciclo e vira **`falhou`**, não `pendente`. Reenviar sozinho poderia duplicar mensagem já entregue, porque o identificador externo só existe depois da entrega: trocaríamos uma perda silenciosa por uma duplicação silenciosa. O ⚠ na timeline devolve a decisão a quem tem contexto. O raciocínio inteiro e o teto da reserva estão em `consumers/lease.ts`.

⚠️ **Ordem obrigatória para levar isto a um banco hospedado:** aplicar `20260821120000_outbox_estado_enviando` primeiro, conferir, só então subir o código. O build do Workers Builds **não roda `migrate deploy`**.

## Rodar local (Bloco 3)

```bash
pnpm --filter @atende/worker dev
```
O bootstrap carrega `apps/worker/.env` (gitignored) automaticamente — precisa de `DATABASE_URL` (Neon) e `ENCRYPTION_KEY` (a **MESMA** do Worker web: auth-state/QR cifrados aqui são decifrados lá). Variável já definida no ambiente tem precedência sobre o arquivo.
Criou canal no painel (/configuracoes/canais) → o worker detecta em ≤15s → QR aparece no painel → escanear no WhatsApp (Aparelhos conectados). Mensagens recebidas viram conversas em `fila_humano`; respostas do painel saem pela outbox (≤3s).
