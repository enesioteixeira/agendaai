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

Importa: `@atende/core`, `@atende/db`, `@atende/ui`, `@atende/dinheiro`, `next`, `react`. Ninguém importa o web.

## Fundação visual (Fase A do doc 12)

Tailwind 4 (`postcss.config.mjs` + `@import 'tailwindcss'` no `globals.css`) e o chassi de `@atende/ui`. Três coisas que quebram de forma confusa se mexidas sem saber:

1. **Ordem das folhas no `layout.tsx`**: `./globals.css` **antes** de `@atende/ui/estilos.css`. O preflight do Tailwind zera borda e espaçamento; se vier por último, desfaz o chassi (mesma especificidade de classe) e a tela renderiza sem moldura — parece estilo faltando, não ordem trocada.
2. **`SCRIPT_DE_TEMA` no `<head>`** (`src/componentes/tema.ts`) roda antes da primeira pintura e escreve a classe `dark` no `<html>`. O tema **escuro é o padrão**, não a preferência do sistema: a identidade Instant é o navy, e abrir claro por causa de um ajuste do Windows faria o primeiro contato não parecer o mesmo produto. Daí o `suppressHydrationWarning` no `<html>` — o servidor não emite a classe.
3. **Os tokens de marca moram aqui**, em `src/app/globals.css`, e não no pacote: o chassi lê `var(--token-do-app, literal)`, então o app sempre vence. Os contrastes anotados nos comentários são **medidos** (WCAG AA); não subir luminosidade sem remedir.

Utilitárias Tailwind com nome de token (`bg-superficie`, `text-texto-suave`, `border-borda`, `rounded-2`) vêm do bloco `@theme inline` do `globals.css`.

## Comandos

```bash
pnpm --filter @atende/web typecheck
pnpm --filter @atende/web build
```

## Estado atual

- [x] Skeleton App Router (layout + landing)
- [x] Auth: `/cadastro` (onboarding cria empresa+admin), `/login`, cookie de sessão (`lib/sessao.ts` — wrapper de next/headers sobre o JWT puro do core), Server Actions em `modules/identidade/actions.ts`
- [x] `(painel)/` protegido: layout checa sessão e redireciona; `/agenda` placeholder mostra tenant+escopos ativos
- [x] Convites: `/configuracoes` (equipe + convites pendentes + gerar link, guard `config:usuarios`), `/convite/[token]` público (aceite cria conta/vínculo + sessão). Envio por e-mail pendente do módulo de e-mail (Fase D) — por ora o link é copiado manualmente
- [x] Deploy Cloudflare Workers via OpenNext (Workers Builds a cada push na main — `atende-ai-web.atende-ai.workers.dev`)
- [x] **Bloco 2 — CRUD da agenda** (`/agenda/*` com abas): serviços (preço em reais no form → centavos na action), profissionais + grade semanal (replace-all), salas/recursos, bloqueios (alvo único validado no Zod), horário de funcionamento por unidade (Json). Actions em `modules/agenda/actions.ts` — padrão sessão → `agenda:configurar` → Zod → `runWithTenant` → `revalidatePath`
- [x] **Bloco 2 — grade da agenda (B3)**: `/agenda` com visões dia (colunas por profissional) e semana (um profissional × 7 dias), slots de 30 min 07–21h no fuso da unidade; criação de agendamento pelo painel (cliente existente ou novo inline) com conflito arbitrado pelo banco (23P01 → mensagem de negócio) e revalidação transacional de bloqueio; concluir/cancelar na própria grade; `/clientes` mínimo (lista + cadastro). Conversão de parede⇄UTC SEMPRE via `paraUtc`/`horaNoFuso` de `@atende/core` — `new Date("YYYY-MM-DDTHH:mm")` cru no workerd interpreta como UTC e desloca -3h (bug corrigido no bloqueio)
- [x] **Bloco 2 — booking pública (B4)**: `(publico)/agendar/[slug]` — fluxo server-rendered por searchParams (serviço → profissional → dia → slot → nome/WhatsApp) + `/confirmado`. Slots calculados por `slotsLivres` (@atende/core, função pura: grade ∩ funcionamento − ocupados − bloqueios − passado) via `slotsBooking`/`criarAgendamentoBooking` (@atende/db, sob runWithTenant do slug). Cliente provisório com dedup por telefone NA transação; conflito = 23P01. Booking por PATH até ter domínio próprio (depois {slug}.dominio → mesma resolução por hostname/KV)
- [x] **Bloco 2 — GCal pull (B5)**: `worker.ts` (entry customizado: fetch do OpenNext + `scheduled` → POST interno em `/api/cron/gcal-pull` com Bearer CRON_SECRET); cron `*/10 * * * *` no wrangler.jsonc (critério ≤15 min). OAuth por profissional: `/api/gcal/conectar` (escopo Google MÍNIMO calendar.freebusy; state HMAC anti-CSRF em `modules/agenda/gcal-state.ts`) → `/api/gcal/callback` (troca code, grava refresh cifrado via `salvarConexaoGcal`, sync imediato). Sync = free/busy 30 dias → bloqueios `origemGcal` replace-all (`aplicarJanelasGcal` — nunca toca bloqueio manual). UI: coluna Google Calendar em /agenda/profissionais (conectar/reconectar/desconectar + última sync). Secrets: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/CRON_SECRET; var APP_BASE_URL. Testar cron local: `wrangler dev --test-scheduled` + GET `/cdn-cgi/handler/scheduled?cron=*/10+*+*+*+*`
- [x] **Bloco 3.4 — painel de atendimento**: `/atendimento` (inbox com abas Abertas/Fila/Minhas/Encerradas, assumir com claim atômico anti-corrida) e `/atendimento/[id]` (histórico estilo chat + responder + encerrar). Envio é OUTBOX: a action grava a `Mensagem` de saída como `pendente` na transação — o worker entrega (o web NUNCA toca socket/pg-boss). `/configuracoes/canais` (config:canais): criar canal WhatsApp Baileys, exibir QR de pareamento (decifra `Canal.configCifrada` quando `pareando`), remover (desativa + limpa auth-state). Tempo real = polling via `AutoRefresh` (router.refresh 3–5s) até o worker ter host público (doc 11)
- [x] **Fase A — fundação visual e rebrand** (doc 12 §10): Tailwind 4 + chassi `@atende/ui` + tokens de marca Instant em `globals.css` (tema escuro padrão, sem piscar); shell do painel reescrito (`(painel)/layout.tsx`) com a marca **Instant Channel** e a navegação do produto — Atender / Vender / Automatizar / Configurar, itens não entregues visíveis e esmaecidos; `/inbox` esqueleto em três colunas lendo `Conversa`/`Mensagem` reais (lista viva; timeline e contexto são molduras da Fase B). A rota `/atendimento` continua no ar e é ela que abre ao clicar numa conversa — trocar a fundação visual não pode derrubar a inbox em produção
- [ ] Seletor de empresa no login (quando houver usuário com 2+ vínculos); edição de papéis/vínculos existentes
- [ ] `api/webhooks/{meta,asaas}` (Blocos 3/5), `api/v1/` (Fase 2)
- [ ] Telas restantes migram para o chassi **oportunisticamente** — quando forem tocadas por outro motivo, não num big-bang. `src/modules/agenda/estilos.ts` (objetos `CSSProperties` inline) é o que resta da fundação anterior e morre junto com a última tela que o usa

## Armadilha — Workers proíbe I/O entre requests

O pool `pg` global não pode reusar socket criado em outra request ("Worker's
code had hung..."). O fix vive em `packages/db/src/unsafe.ts`: `maxUses: 1`
no PrismaPg quando `navigator.userAgent === "Cloudflare-Workers"` (receita
OpenNext howtos/db). Em Node o pool reusa normalmente. Não "otimizar" isso.
