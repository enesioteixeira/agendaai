# Mensvra Channel

> O diretório e o repositório ainda se chamam `atende-ai` / `agendaai`. É de propósito: renomear arrasta Cloudflare Workers Builds junto, e a troca acontece quando o código sair da conta pessoal para a organização da empresa (`instant-empresa/adr/0011`).

SaaS **multi-tenant** de **atendimento e venda por conversa** — WhatsApp, Instagram, Messenger, webchat, Telegram e e-mail numa caixa só, com agente de IA que atende, qualifica e entrega o lead pronto.

O comprador é o **distribuidor com entrega** (`instant-empresa/adr/0001`). O público antigo de horário marcado — salão, barbearia, clínica, advocacia — foi descartado junto com a precificação que o atendia; o módulo de agenda continua no código, **desligado por sinalizador**.

## Status

O que está no ar é o produto **anterior** ao pivô. A inbox operacional, o motor de IA e os agentes estão construídos na branch `mensvra` e **não publicados**, porque o banco hospedado ainda não recebeu as migrations — ver [`CLAUDE.md`](CLAUDE.md).

Estágio corrente: **E1 — cobrável e vendável**. Nada é cobrável ainda: não há plano aplicado, assinatura, período de teste nem porta de pagamento. Régua completa em `instant-empresa/09-plano/estagios.md`; o que dá para demonstrar hoje, sem pedir licença, está em `instant-empresa/03-portfolio/estoque-vendavel.md`.

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
| [`docs/10-setup-contas.md`](docs/10-setup-contas.md) | Passo a passo dos cadastros externos (Neon, Cloudflare, OCI, Meta, Asaas...) |

## Arquitetura em uma linha

`apps/web` (Next.js via OpenNext em **Cloudflare Workers**) + **Neon Postgres** (adapter `pg` via pooler; filas via **pg-boss**) + `apps/worker` (Node sempre-ativo em **Oracle Cloud Always Free**: sockets Baileys multi-tenant, consumidores pg-boss, hub SSE).

## Princípios

- **Orçamento zero**: free tiers permanentes e comercialmente permitidos; únicos custos do dia 1 são domínio, IA por uso e gateway por transação.
- **Isolamento de tenant inviolável**: shared schema + `empresaId` pervasivo via Prisma Client Extension; RLS na Fase 2.
- **LGPD por construção**: cada empresa é controladora, a plataforma é operadora.
- **Executável por agentes de IA**: `AGENTS.md` por módulo, contratos Zod, convenções documentadas.
