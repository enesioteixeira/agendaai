# atende-ai (agendaai)

SaaS **multi-tenant** de agendamento e gestão para negócios de horário marcado — salões de beleza, barbearias, clínicas de estética, clínicas médicas, escritórios de advocacia e segmentos similares.

Carro-chefe: **agendamento + atendimento omnichannel** (WhatsApp primeiro), operado por dois motores combináveis — **árvore de decisão** determinística e **IA conversacional** — com handoff humano sem perda de contexto.

## Status

**Fase 1 — Planejamento** concluída nos documentos em [`docs/`](docs/). A Fase 2 (protótipo end-to-end) inicia após validação dos documentos.

## Documentação

| Doc | Conteúdo |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Regras invioláveis globais (tenancy, LGPD, propose-confirm) |
| [`docs/01-arquitetura.md`](docs/01-arquitetura.md) | Topologia, componentes, trade-offs, bounded contexts, riscos |
| [`docs/02-modelo-de-dados.md`](docs/02-modelo-de-dados.md) | ER multi-tenant completo por domínio |
| [`docs/03-stack.md`](docs/03-stack.md) | Stack por componente com justificativa |
| [`docs/04-roadmap.md`](docs/04-roadmap.md) | MVP → Fase 2 → Fase 3, critérios de pronto |
| [`docs/05-omnichannel.md`](docs/05-omnichannel.md) | Spec do módulo central: conectores, motores, transições |
| [`docs/06-precificacao.md`](docs/06-precificacao.md) | Planos Basic/Pro/Premium + memória de cálculo |
| [`docs/07-infra-free-tier.md`](docs/07-infra-free-tier.md) | Infra gratuita: limites, gatilhos de migração, custos |
| [`docs/08-reuso-ev-tracker.md`](docs/08-reuso-ev-tracker.md) | Mapa de reuso do projeto ev-tracker (origem → destino) |
| [`docs/09-estrutura-monorepo.md`](docs/09-estrutura-monorepo.md) | Árvore do monorepo, convenções, template de AGENTS.md |

## Arquitetura em uma linha

`apps/web` (Next.js via OpenNext em **Cloudflare Workers**) + **Neon Postgres** (adapter `pg` via pooler; filas via **pg-boss**) + `apps/worker` (Node sempre-ativo em **Oracle Cloud Always Free**: sockets Baileys multi-tenant, consumidores pg-boss, hub SSE).

## Princípios

- **Orçamento zero**: free tiers permanentes e comercialmente permitidos; únicos custos do dia 1 são domínio, IA por uso e gateway por transação.
- **Isolamento de tenant inviolável**: shared schema + `empresaId` pervasivo via Prisma Client Extension; RLS na Fase 2.
- **LGPD por construção**: cada empresa é controladora, a plataforma é operadora.
- **Executável por agentes de IA**: `AGENTS.md` por módulo, contratos Zod, convenções documentadas.
