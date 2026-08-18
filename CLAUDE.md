# atende-ai / Mensvra Channel — CLAUDE.md (raiz)

SaaS **multi-tenant** de **atendimento e venda por conversa** (omnichannel: WhatsApp, Instagram, Messenger, webchat, Telegram, e-mail), operado por dois motores combináveis — **árvore de decisão** determinística e **IA conversacional** com agentes criados e treinados pelo próprio tenant —, com handoff humano, catálogo com fechamento de pedido na conversa e integrações nativas com ERPs (principalmente o **Mensvra ERP**) e CRMs.

> **Pivô de produto (2026-08-16) — leia `docs/12-mensvra-channel.md` antes de planejar qualquer trabalho novo.**
> O produto passa a se chamar **Mensvra Channel** (grafia "Mensvra Channel" em decisão — doc 12 §1.5). Não é fork: este monorepo **é** o produto, o rebrand é progressivo.
> **O módulo `agenda` está CONGELADO**: continua funcionando e é mantido quanto a segurança/tenancy/LGPD, mas não recebe funcionalidade nova, não entra no caminho crítico e **não expõe tools de IA** no escopo inicial.
> Blocos 0–3 do `docs/04-roadmap.md` seguem válidos; do Bloco 4 em diante o roadmap é o das **Fases A–I** do doc 12 §10.

Status: **Fase 1 concluída** · **Blocos 0, 1 e 2 do MVP concluídos e em produção** (`atende-ai-web.atende-ai.workers.dev`, deploy automático via Cloudflare Workers Builds a cada push na `main`): tenancy fail-closed, identidade/RBAC/convites, agenda completa (CRUD, grade dia/semana, exclusion constraints, booking pública `/agendar/{slug}`, GCal pull via Cron Trigger). Divergências de implementação vs. desenho: `docs/11-adaptacoes-implementacao.md`. Próximo: Bloco 3 (canais). Antes de editar um módulo, leia o `AGENTS.md` dele.

## Mapa de documentação (ler antes de qualquer tarefa)

| Doc | Conteúdo |
|---|---|
| `docs/01-arquitetura.md` | Topologia, componentes, trade-offs, bounded contexts, riscos |
| `docs/02-modelo-de-dados.md` | ER multi-tenant completo por domínio |
| `docs/03-stack.md` | Stack por componente com justificativa |
| `docs/04-roadmap.md` | MVP → Fase 2 → Fase 3, critérios de pronto |
| `docs/05-omnichannel.md` | Spec do módulo central: conectores, motores, transições |
| `docs/06-precificacao.md` | Planos Basic/Pro/Premium + memória de cálculo |
| `docs/07-infra-free-tier.md` | Infra gratuita: limites, gatilhos de migração, custos |
| `docs/08-reuso-ev-tracker.md` | Mapa de reuso do projeto ev-tracker (origem → destino) |
| `docs/09-estrutura-monorepo.md` | Árvore do monorepo, convenções, template de AGENTS.md |
| `docs/10-setup-contas.md` | Checklist de contas externas (Neon, Cloudflare, Google, Meta, Asaas...) |
| `docs/11-adaptacoes-implementacao.md` | Onde a implementação divergiu do desenho, por quê e gatilho de reversão |
| `docs/12-mensvra-channel.md` | **Plano de ação do pivô omnichannel (Mensvra Channel)**: visão, arquitetura alvo, mapa de reúso do ev-tracker, conectores, agentes de IA treináveis, catálogo/venda, hub ERP/CRM, API aberta, UI e Fases A–I |

## Arquitetura em uma linha

`apps/web` (Next.js via OpenNext em **Cloudflare Workers**) + **Neon Postgres** (adapter `pg` via pooler, com transação; filas via **pg-boss**) + `apps/worker` (Node sempre-ativo em **Oracle Cloud Always Free**: sockets Baileys multi-tenant, consumidores pg-boss, hub SSE).

## Ambiente local — o produto roda inteiro sem nuvem

Banco, fila e armazenamento de mídia sobem em container. A troca para Neon e R2 na hora de comercializar é de endereço e credencial, não de código.

```bash
docker compose -f infra/docker-compose.yml up -d
export DATABASE_URL="postgresql://mensvra:devlocal@localhost:55432/mensvra_channel"
pnpm --filter @atende/db exec prisma migrate deploy
pnpm --filter @atende/db seed      # catálogo de planos + cenário de distribuidor
pnpm test                          # com banco, os e2e de isolamento rodam de verdade

pnpm --filter @atende/web dev       # painel em http://localhost:3000
```

O seed cria o tenant de demonstração pelo mesmo caminho de um cliente real, então ele já vem com usuário, papéis e escopos: entre em `/login` com **ana@aurora.com.br** / **aurora-local-123**. Credencial escrita de propósito — é ambiente local e descartável, e o valor de estar aqui é ninguém precisar perguntar a senha.

Duas armadilhas que já custaram tempo:

- **Os `.env` locais apontam para o Postgres local**, inclusive o do worker. As URLs do Neon ficaram guardadas em `.env.neon` ao lado de cada um (também fora do git). Mesmo assim, confira com `prisma migrate status` — ele imprime o host — antes de qualquer comando que escreva.
- **O build do Workers Builds não roda `migrate deploy`.** Migration é aplicada à mão contra o destino. Subir código que depende de coluna nova antes de aplicá-la quebra produção; a ordem é migration → conferir → código.

## Regras invioláveis

Estas regras valem para TODO código deste repositório. Nenhuma "otimização" ou refatoração pode violá-las.

### Tenancy
1. **Toda query passa pelo Prisma Client com extension de tenant** (injeta `where { empresaId }` via AsyncLocalStorage). O client cru (`prismaSemTenant`, em `packages/db/src/unsafe.ts`) só pode ser usado **dentro de `packages/db`** (migração/seed e o resolver `slug → empresaId` da booking) e nos **jobs de plataforma auditados do worker** (`apps/worker/src/consumers/plataforma.ts`) — uso fora disso é bug de segurança (allowlist idêntica: doc 01 §5.2, doc 02 §15.2, doc 09 §3.2).
2. Toda unicidade é **composta com o tenant**: `@@unique([empresaId, ...])`. Nunca `@unique` global em dado de tenant (exceção: `Usuario.email` e models de plataforma).
3. A identidade do tenant vem **sempre da sessão JWT** (`empresaId`/`unidadeId`/`papelId`) — nunca de input do cliente, de parâmetro de URL sem validação, ou de saída de modelo de IA.

### LGPD (herdadas do ev-tracker, adaptadas para multi-tenant)
4. Cada empresa (tenant) é **controladora**; a plataforma é **operadora**. Todos os models LGPD (`AuditLog`, `AccessLog`, `ConsentimentoLGPD`, `SolicitacaoLGPD`, `ConfigLgpd`) carregam `empresaId`; `ConfigLgpd` é por empresa.
5. **Auditoria ANTES de mutação destrutiva** (anonimização, exclusão, export).
6. Models LGPD **nunca referenciam Usuario/Cliente via `@relation`** — cascade delete não pode apagar trilha. IDs são `String?` puros de propósito.
7. **Consentimento é insert-only** — nunca update/upsert; revogação é um novo registro.
8. Export de dados **nunca inclui** hash de senha, tokens OAuth ou segredos cifrados.
9. Nunca remover ou "simplificar" os models LGPD, o cron de retenção ou o soft-delete (`deletedAt: null` em toda leitura de dados de titular).

### IA e atendimento
10. **Toda escrita disparada por IA passa por propose-confirm**: a tool cria `PropostaAcao` PENDENTE (TTL 15 min); a execução é determinística, sem LLM, com auditoria; a confirmação só vale vinda da **mesma conversa/identidade** que originou a proposta.
11. Contexto de tools de IA vem da sessão/conversa autenticada — **nunca do texto do modelo** (anti prompt-injection).
12. **Envio proativo (lembretes, cobrança) só pela API oficial do WhatsApp.** Canais não oficiais (Baileys) apenas respondem conversas iniciadas pelo cliente (anti-ban).

### Banco e código
13. **`prisma migrate` sempre** — `db push --accept-data-loss` é banido neste repo.
14. **Zod em toda borda**: webhooks, server actions, API pública (`/api/v1`), config JSON de nós de fluxo. Os schemas vivem em `packages/core` e são o contrato entre `apps/web` e `apps/worker`.
15. Segredos em repouso cifrados com AES-256-GCM (`packages/core/crypto`); nunca em texto puro no banco, nunca hardcoded.
16. Valores monetários em **centavos (Int)**; datas em UTC no banco, fuso da `Unidade` na apresentação.
17. Nomes de domínio em PT-BR **sem acentos** (`Agendamento`, `Cobranca`, `criarAgendamento`); infraestrutura em EN (`db`, `queue`, `connectors`).

## Convenções para agentes de IA

- Cada package/app tem um `AGENTS.md` com propósito, contratos (apontando para schemas Zod), invariantes, o-que-nunca-fazer e comandos de teste. **Leia o AGENTS.md do módulo antes de editar o módulo.**
- Toda feature nova atualiza o `AGENTS.md` do módulo **no mesmo PR**.
- Server Actions para mutações do painel; route handlers para API pública (versionada em `/api/v1/...`) e webhooks. Lógica de domínio vive em `packages/core`, nunca em componente React.
- Eventos entre módulos via outbox (pg-boss) — `atendimento` e `financeiro` podem chamar `agenda`/`clientes`; ninguém chama `atendimento` de volta.
