# Stack Tecnológica — atende-ai

**Sumário executivo.** Este documento registra a stack tecnológica decidida para o atende-ai e a justificativa de cada escolha sob quatro lentes: escalabilidade, custo (orçamento inicial zero, free tiers permanentes), maturidade e **continuidade com o ev-tracker** — o projeto anterior cuja infraestrutura transversal (WhatsApp 3 provedores, IA dual-provider, e-mail em cascata, LGPD, crypto, auth JWT) será reaproveitada por cópia adaptada. A stack é deliberadamente enxuta: um só ecossistema (TypeScript + Node) atravessando `apps/web`, `apps/worker` e `packages/*`; Postgres como única peça stateful (dados, filas via pg-boss e auth-state Baileys no mesmo banco); e serviços gerenciados apenas onde o free tier é comercialmente permitido. Cada seção traz a escolha, a justificativa e a alternativa descartada com motivo — este documento registra **decisões**, não cardápios.

## Visão geral

| Componente | Escolha | Alternativa descartada |
|---|---|---|
| Linguagem/runtime | TypeScript + Node | Go/Python no worker; Bun |
| Framework web | Next.js App Router via OpenNext em Cloudflare Workers | Vercel |
| UI | Tailwind 4 + componentes próprios; PWA | shadcn/ui + Radix; app nativo já no MVP |
| Banco | Neon Postgres (adapter `pg` via pooler, com transação) | Driver Neon HTTP (padrão do ev-tracker); Supabase |
| ORM | Prisma 6 + Client Extension de tenancy | Drizzle; RLS como única defesa |
| Validação | Zod em toda borda | valibot; class-validator |
| Auth | JWT próprio com `jose` | next-auth/Auth.js; Clerk |
| Filas/cron | pg-boss | BullMQ + Redis; Cloudflare Queues; QStash |
| Cache | Memória do worker + Cloudflare KV | Redis (Upstash) |
| Realtime | SSE do worker + fallback polling | WebSockets (Durable Objects); Pusher/Ably |
| Storage | Cloudflare R2 | AWS S3; Supabase Storage |
| E-mail | Cascata Brevo → Resend → SMTP do tenant | SES; provedor único |
| IA | Dual-provider: Gemini 2.5 Flash + Claude Haiku 4.5 | Provedor único; free tier em produção |
| WhatsApp | Meta Cloud API oficial + Baileys (worker próprio) | BSP (Twilio/Zenvia/360dialog) |
| Observabilidade | Sentry + BetterStack Uptime | Datadog; self-hosted |
| CI/CD | GitHub Actions | CircleCI; GitLab CI |
| Gateway de pagamento | **Asaas** (atrás de camada `PaymentProvider`) | Mercado Pago; InfinitePay; Stripe |
| Assinatura eletrônica | Motor próprio (MP 2.200-2 + Lei 14.063/2020) | ZapSign como padrão (fica sob demanda p/ ICP-Brasil) |
| Nota fiscal | Emissor nacional gratuito → Focus NFe (Fase 2) | Integração fiscal já no MVP |

---

## Linguagem e runtime — TypeScript + Node

**Escolha:** TypeScript em todo o monorepo (`apps/web`, `apps/worker`, `packages/*`), rodando em Node no worker e no runtime Workers (via OpenNext) no web.

**Justificativa:**

- **Continuidade:** é a decisão de maior alavancagem do projeto. Todo o código reaproveitável do ev-tracker (`whatsapp.ts`, `esteira/`, `email.ts`, `lgpd.ts`, `crypto.ts`, `session.ts`, o worker Baileys inteiro) é TypeScript/Node. Um segundo ecossistema anularia o mapa de reuso do doc 08.
- **Um só ecossistema web+worker:** os schemas Zod em `packages/core` são o contrato tipado entre `apps/web` e `apps/worker` — isso só funciona sem atrito com uma única linguagem. Baileys, Prisma e pg-boss são todos bibliotecas Node.
- **Escalabilidade:** o gargalo do produto é I/O (webhooks, sockets WhatsApp, chamadas de IA), não CPU — perfil em que Node escala bem com um único processo por VM.
- **Maturidade:** ecossistema mais maduro possível para SaaS web; contratação e tooling triviais.

**Alternativa descartada:** Go ou Python para o worker (performance/ergonomia de concorrência) — descartados porque criariam dois ecossistemas, duplicariam validação e matariam o reuso do worker Baileys já endurecido em produção (fix @lid, 502, nono dígito). **Bun** como runtime — descartado por maturidade: incompatibilidades residuais com Prisma e Baileys não valem o ganho de performance num sistema I/O-bound.

## Framework web — Next.js App Router via OpenNext em Cloudflare Workers

**Escolha:** Next.js (App Router, Server Actions para o painel, route handlers para API pública `/api/v1` e webhooks), publicado em Cloudflare Workers através do adapter OpenNext.

**Justificativa:**

- **Custo/conformidade:** o free tier da Cloudflare (100k req/dia) **permite uso comercial**; o Vercel Hobby proíbe e o Pro custa US$ 20/mês — incompatível com a regra de orçamento zero. Essa é uma decisão de conformidade de licença, não de preferência técnica.
- **Escalabilidade:** Workers escala horizontalmente sem configuração; o degrau seguinte é Workers Paid a US$ 5/mês — o upgrade mais barato de toda a stack.
- **Continuidade:** o ev-tracker é Next.js; padrões de Server Actions, route handlers e middleware transferem direto.
- **Maturidade:** Next.js App Router é o framework React de produção dominante; OpenNext é o caminho oficial recomendado pela própria Cloudflare para Next.js.

**Trade-off honesto:** o adapter OpenNext adiciona fricção (nem toda API Node existe no runtime Workers) e o free tier limita a ~10ms de CPU por invocação — o que força SSR leve e empurra qualquer trabalho pesado para o worker via pg-boss. É uma restrição saudável: alinha com a arquitetura "web enfileira, worker processa".

**Alternativa descartada:** **Vercel** — DX superior e zero fricção com Next.js, mas Hobby proíbe uso comercial e Pro fura o orçamento zero no dia 1. Remix/SvelteKit — descartados por quebrarem continuidade com o ev-tracker sem ganho que justifique reaprender o stack de padrões.

## UI — Tailwind 4 + componentes próprios; PWA

**Escolha:** Tailwind CSS 4 com biblioteca de componentes própria em `apps/web`; o painel e a booking page são **PWA** (manifest + service worker: instalável, cache de shell, pronto para push notification quando os canais suportarem).

**Justificativa:**

- **Continuidade:** o ev-tracker usa Tailwind + componentes próprios; padrões visuais e utilitários transferem.
- **Custo/controle:** componentes próprios evitam dependência de design system de terceiros num produto **white-label** (booking page com marca do tenant no plano Premium) — theming por CSS variables fica sob nosso controle total.
- **Escalabilidade de produto:** PWA entrega "app instalável" para recepcionistas e profissionais sem custo de loja, review da Apple ou segundo codebase. App nativo (Expo/React Native) é decisão de Fase 2/3, quando houver receita para sustentá-lo.
- **Maturidade:** Tailwind 4 é estável e o motor novo (CSS-first) reduz build config a quase zero.

**Alternativa descartada:** **shadcn/ui + Radix** — excelente, mas adiciona camada de dependência e opinião visual que atrapalha white-label profundo; se um componente específico (ex.: combobox acessível) custar caro de fazer, copiamos pontualmente o padrão, não a biblioteca inteira. **App nativo no MVP** — descartado: dobra o esforço de front antes de validar o produto.

## Banco de dados — Neon Postgres (adapter `pg` via pooler, com transação)

**Escolha:** Neon Postgres serverless como único banco. Conexão via **adapter `pg` apontando para o pooler do Neon**, com suporte a **transações interativas**. `prisma migrate` é obrigatório (`db push --accept-data-loss` é banido — regra inviolável 13).

**Justificativa:**

- **Continuidade parcial e deliberadamente quebrada:** o ev-tracker usa Neon, então o conhecimento operacional (branches, autosuspend, CU-hours) transfere. Mas **abandonamos o driver Neon HTTP** usado lá: ele não suporta transação interativa, e o atende-ai depende de transação para o **outbox pg-boss** (gravar o dado de domínio + enfileirar o job no mesmo commit) e para invariantes da agenda (reserva de horário com exclusion constraint). Sem transação, não há consistência multi-tenant confiável.
- **Custo:** free tier de 100 CU-h + 0,5 GB cobre o MVP; degrau seguinte é o plano Launch (US$ 19/mês) — gatilho documentado no doc 07.
- **Escalabilidade:** Postgres puro, sem dialeto proprietário; se o Neon deixar de servir, o dump restaura em qualquer Postgres (RDS, Supabase, VM própria). pg-boss e auth-state do Baileys moram no mesmo banco — uma peça stateful só.
- **Maturidade:** Postgres é a escolha mais conservadora possível; exclusion constraints (anti-sobreposição da agenda) e RLS (Fase 2) são recursos nativos.

**Alternativa descartada:** **manter o driver Neon HTTP** — mais simples em edge, mas sem transações interativas é desqualificado pelo outbox e pela agenda; a "continuidade" aqui seria continuidade de um defeito. **Supabase** — Postgres também, mas o free tier pausa o projeto após inatividade e empacota auth/storage que já resolvemos de outra forma.

## ORM — Prisma 6 + Client Extension de tenancy

**Escolha:** Prisma 6 com uma **Client Extension** que injeta `where { empresaId }` em toda query, lendo o tenant de `AsyncLocalStorage`. O client cru vive isolado em `packages/db/src/unsafe.ts` (`prismaSemTenant`), lint-gated, só para jobs de plataforma auditados. RLS Postgres entra na Fase 2 como **defesa em profundidade**, não como substituto.

**Justificativa:**

- **Continuidade:** o ev-tracker é Prisma 6 — schema patterns, migrations e os 5 models LGPD transferem por cópia adaptada (ganhando `empresaId`).
- **Segurança de tenancy por construção:** a extension torna o isolamento o caminho *default* do código — esquecer o filtro deixa de ser possível na API normal. É a materialização da regra inviolável 1.
- **Maturidade:** Prisma é o ORM TypeScript mais maduro; a API de Client Extensions é estável desde a v5.
- **Escalabilidade:** com o adapter `pg` + pooler (seção anterior), o custo histórico do Prisma em serverless (conexões) está endereçado.

**Trade-off honesto:** a extension cobre queries Prisma, não `$queryRaw` — SQL cru precisa de revisão manual e é exatamente por isso que RLS entra na Fase 2 como segunda camada. Aceitamos essa janela no MVP em troca de velocidade, com teste automatizado de isolamento entre tenants como critério de pronto.

**Alternativa descartada:** **Drizzle** — mais leve e SQL-first, mas sem continuidade com o ev-tracker e sem um padrão de extension de tenancy tão direto; migrar ORM é custo puro aqui. **RLS como única defesa desde o dia 1** — descartado como *única* camada porque acopla todo o desenvolvimento a `SET LOCAL` por request e complica o pooler; a ordem escolhida (extension já, RLS na Fase 2) entrega isolamento imediato e redundância depois.

## Validação — Zod em toda borda

**Escolha:** Zod valida **toda borda** do sistema: webhooks (Meta, Asaas), Server Actions, API pública `/api/v1`, config JSON dos nós de `FluxoArvore` (discriminated unions) e payloads de jobs pg-boss. Os schemas vivem em `packages/core` e são o **contrato entre `apps/web` e `apps/worker`**.

**Justificativa:**

- **Continuidade:** padrão já usado no ev-tracker.
- **Arquitetura:** num sistema com dois deploys independentes (web na Cloudflare, worker na Oracle), o contrato compartilhado tipado em runtime é o que impede drift silencioso — o mesmo schema que valida o webhook valida o job que o worker consome.
- **Maturidade/ecossistema:** inferência de tipos, discriminated unions (essenciais para os nós de fluxo) e integração natural com Server Actions.
- **Custo:** zero.

**Alternativa descartada:** **valibot** — menor bundle, mas ecossistema e ergonomia de discriminated unions inferiores; bundle size não é gargalo no server. **class-validator/decorators** — estilo OOP alheio ao codebase herdado.

## Autenticação — JWT próprio com `jose`

**Escolha:** Sessão JWT própria assinada com `jose`, **reaproveitada de `session.ts` do ev-tracker**, com payload estendido para tenancy: `{usuarioId, empresaId, unidadeId, papelId, escopos[]}`. Sem next-auth.

**Justificativa:**

- **Continuidade:** esforço trivial (mapa de reuso do doc 08) — o código existe, funciona e só ganha campos no payload.
- **Tenancy segura:** a regra inviolável 3 exige que a identidade do tenant venha **sempre da sessão** — nunca de input do cliente ou de saída de IA. Controlar o payload do token é controlar a superfície de segurança mais crítica do sistema; terceirizar isso a uma lib de conveniência adiciona camada onde precisamos de transparência.
- **Custo:** zero, sem serviço externo.
- **Maturidade:** `jose` é a implementação JWT de referência do ecossistema, compatível com o runtime Workers (Web Crypto).

**Alternativa descartada:** **next-auth/Auth.js** — resolve OAuth social (que não precisamos no painel B2B) e atrapalha exatamente onde precisamos de controle (shape da sessão multi-tenant, RBAC com escopos). **Clerk/Auth0** — free tiers com teto de MAU baixo e lock-in do dado mais sensível do sistema; furam orçamento e a postura LGPD.

## Filas e cron — pg-boss

**Escolha:** pg-boss sobre o próprio Neon Postgres para filas, retries, cron (lembretes, régua de cobrança, retenção LGPD) e **outbox transacional** entre módulos (regra: eventos via outbox; ninguém chama `atendimento` de volta).

**Justificativa:**

- **Custo:** zero — nenhuma peça de infra nova; usa o banco que já existe.
- **Consistência:** por rodar no mesmo Postgres, o enqueue participa da **mesma transação** do dado de domínio (padrão outbox de verdade, não "best effort"). É o motivo técnico que também derrubou o driver Neon HTTP.
- **Escalabilidade:** aguenta confortavelmente o volume do MVP e além (milhares de jobs/min está muito acima da necessidade); se um dia saturar, o gargalo aparece primeiro no plano do Neon, com gatilho no doc 07.
- **Maturidade:** biblioteca estável, madura, largamente usada exatamente neste papel (fila leve sem Redis).

**Alternativa descartada:** **BullMQ + Redis** — exigiria um Redis gerenciado (Upstash) só para a fila, quebrando "sem Redis" e adicionando peça stateful sem necessidade. **Cloudflare Queues** — requer Workers Paid e não participa da transação do Postgres. **QStash** — HTTP push externo, free tier apertado e sem transacionalidade com o banco.

## Cache — memória do worker + Cloudflare KV (sem Redis)

**Escolha:** dois níveis, nenhum deles Redis: (1) **memória do processo do worker** (VM sempre-ativa na Oracle) para estado quente — sockets Baileys, contexto de conversas ativas, rate limits; (2) **Cloudflare KV** no web para cache read-heavy e tolerante a eventual consistency — config pública da booking page por slug, catálogo de serviços.

**Justificativa:**

- **Custo:** zero em ambos; Redis gerenciado seria a única razão de existir de um custo/peça nova.
- **Arquitetura:** o worker é um processo único sempre-ativo — memória local é o cache mais rápido e simples possível para o estado que só ele usa. KV é nativo do runtime onde o web roda.
- **Escalabilidade:** o dado que precisaria de cache distribuído coerente (agenda, propostas de ação) **fica no Postgres de propósito** — cache é otimização de leitura, nunca fonte de verdade.

**Trade-off honesto:** KV é eventualmente consistente (propagação de segundos a ~1 min) — aceitável para config de booking page, inaceitável para disponibilidade de horário, que por isso é sempre lida do banco com exclusion constraint como juiz final.

**Alternativa descartada:** **Redis (Upstash)** — resolveria cache distribuído e locks, mas adiciona peça stateful, free tier com teto de comandos, e nenhum caso de uso do MVP o exige. Entra em reavaliação apenas se surgir necessidade real de lock distribuído (hoje o Postgres cobre com advisory locks).

## Realtime — SSE do worker + fallback polling

**Escolha:** o painel de atendimento (inbox omnichannel) recebe eventos por **Server-Sent Events servidos pelo worker** (VM Oracle, conexões longas sem limite de duração), com **fallback automático para polling** curto quando SSE não estiver disponível (proxy corporativo, rede móvel instável).

**Justificativa:**

- **Arquitetura:** o worker já é quem sabe dos eventos (mensagens inbound chegam nele via Baileys ou via job pg-boss) — servir SSE dali evita um salto. Workers/Cloudflare free não sustenta conexões longas de forma confiável; a VM sim.
- **Custo:** zero — SSE é HTTP puro, sem serviço de terceiros.
- **Maturidade/simplicidade:** SSE é unidirecional (server→client), que é exatamente o que um inbox precisa; as ações do atendente sobem por Server Action/fetch normal. Reconexão automática é nativa do `EventSource`.
- **Escalabilidade:** um processo Node segura dezenas de milhares de conexões SSE ociosas; muito acima do teto de tenants do free tier.

**Alternativa descartada:** **WebSockets via Durable Objects** — exige Workers Paid e adiciona modelo de programação novo para um problema que SSE resolve. **Pusher/Ably** — free tiers com teto de conexões/mensagens baixo e custo que escala com o sucesso do produto; terceiriza um componente barato de operar.

## Storage — Cloudflare R2

**Escolha:** Cloudflare R2 para mídia de conversas (áudios, imagens recebidas por WhatsApp), documentos congelados do motor de assinatura, manifestos PDF e exports LGPD. Acesso sempre por URL assinada e chaves prefixadas por `empresaId/`.

**Justificativa:**

- **Custo:** 10 GB grátis e — decisivo — **egress zero**. Mídia de atendimento é lida muitas vezes depois de gravada; em S3 o egress seria o primeiro custo surpresa do projeto.
- **Arquitetura:** API compatível com S3 (SDKs maduros, zero lock-in de código) e integração nativa com o runtime Workers onde o web roda.
- **Escalabilidade:** degrau pago por uso, sem salto de plano.
- **Maturidade:** produto estável, amplamente adotado exatamente como "S3 sem egress".

**Alternativa descartada:** **AWS S3** — padrão de mercado, mas egress cobrado inviabiliza mídia servida com frequência no orçamento zero. **Supabase Storage** — amarraria o storage à decisão de banco que já descartamos.

## E-mail — cascata Brevo → Resend → SMTP próprio do tenant

**Escolha:** motor de cascata **herdado de `email.ts` do ev-tracker** (lá: SMTP→Gmail→Resend), reordenado para: **Brevo primário** (300/dia grátis) → **Resend** (3.000/mês grátis) → **SMTP próprio do tenant** (opcional, configurado pela empresa para enviar com o domínio dela). Templates novos por vertical.

**Justificativa:**

- **Continuidade:** o motor de fallback com retry já existe e está provado em produção; o esforço é baixo (inserir driver Brevo + templates).
- **Custo/resiliência:** dois free tiers em cascata cobrem o MVP com folga (e-mail é canal secundário — lembrete primário é WhatsApp); a cascata elimina o provedor único como ponto de falha.
- **Produto:** SMTP do tenant como terceiro degrau serve o caso white-label (Premium): e-mail saindo do domínio da empresa, custo dela.
- **Maturidade:** Brevo e Resend são estáveis, com APIs simples; nodemailer cobre o degrau SMTP.

**Alternativa descartada:** **Amazon SES** — o mais barato em escala, mas exige conta AWS com cartão, processo de saída de sandbox e gestão de reputação — fricção desproporcional para canal secundário no MVP. **Provedor único** — descartado: a cascata custa quase nada de código (já existe) e compra resiliência real.

## IA — dual-provider: Gemini 2.5 Flash + Claude Haiku 4.5

**Escolha:** motor dual-provider **herdado de `src/lib/esteira/` do ev-tracker** (loop de tool-use, propose-confirm, anti-injection), com prompts e tools trocados para o domínio de agendamento. **Gemini 2.5 Flash é o default** (~R$ 0,10/conversa); **Claude Haiku 4.5 assume por escalação** (~15% das conversas: baixa confiança, sentimento negativo, casos complexos) — custo médio ponderado **~R$ 0,14/conversa**, coberto pela precificação (excedente cobrado a R$ 0,49/conversa).

**Justificativa:**

- **Continuidade:** o componente de maior risco técnico do produto (agente com tool-use seguro) já existe testado — inclusive o padrão propose-confirm que é regra inviolável (10 e 11).
- **Custo com qualidade:** o par "Flash barato para o grosso + Haiku melhor para o difícil" entrega qualidade percebida alta pagando preço de modelo econômico em ~85% do volume.
- **Resiliência:** dois provedores independentes = degradação, não queda, quando um deles instabiliza.
- **LGPD (decisão inegociável):** o **free tier do Gemini é permitido APENAS em dev** — em produção, dados de clientes dos tenants **não podem ser usados para treinar modelos**, o que veta o free tier por definição. IA em produção nasce paga por uso desde o dia 1, e a precificação (doc 06) já absorve isso.

**Alternativa descartada:** **provedor único** — mais simples, porém elimina a válvula de escalação de qualidade e cria ponto único de falha num componente central do produto. **Free tier em produção** — vetado por LGPD, sem exceção. **Modelos maiores como default** — custo por conversa estouraria a margem do plano Basic sem ganho perceptível nos fluxos de agendamento, que são curtos e estruturados.

## WhatsApp — Meta Cloud API oficial + Baileys (worker próprio)

**Escolha:** dois provedores, **configuráveis por empresa** no painel: **Meta Cloud API oficial** (número verificado, templates, reply buttons) e **Baileys** (não oficial, QR code, custo zero por mensagem) rodando no worker próprio como gestor de N sockets (`Map<canalId, socket>`). Regra inviolável 12: **envio proativo (lembretes, cobrança) só pela API oficial**; Baileys apenas responde conversas iniciadas pelo cliente.

**Justificativa:**

- **Continuidade:** `src/lib/whatsapp.ts` (parse, retry, HMAC, anti-ban) e o `whatsapp-worker/` inteiro (auth-state no Postgres, backoff, fixes @lid/502/nono dígito) vêm do ev-tracker — a adaptação relevante é o socket global virar multi-tenant.
- **Custo/produto:** a dupla cobre os dois perfis reais de tenant: o salão pequeno que quer plugar o número existente sem custo (Baileys) e a clínica que precisa de proativo confiável e botões (oficial, inbound grátis, utility ~US$ 0,008/msg no BR).
- **Risco gerenciado:** o risco de ban do Baileys é real e é mitigado por política, não por esperança: nada proativo sai por ele. Trade-off honesto: um tenant só-Baileys não tem lembrete automático — o painel deixa isso explícito e empurra o upgrade para o canal oficial.
- **Escalabilidade:** a Cloud API é direta da Meta (sem markup); Baileys escala por sockets na VM.

**Alternativa descartada:** **BSPs (Twilio, Zenvia, 360dialog)** — abstraem o onboarding da Meta, mas cobram markup por mensagem e/ou mensalidade por número, custo que escala exatamente com o sucesso do produto; a Cloud API direta é o mesmo canal sem o pedágio.

## Observabilidade — Sentry + BetterStack Uptime

**Escolha:** **Sentry** (free: 5k erros/mês) para exceções e traces em `apps/web` e `apps/worker`, com tag `empresaId` em todo evento; **BetterStack Uptime** (free) para heartbeat do worker, healthcheck do web e status dos webhooks — com alerta imediato, porque worker caído = WhatsApp mudo.

**Justificativa:**

- **Custo:** ambos free tiers suficientes para o MVP; degrau pago só com volume que implica receita.
- **Arquitetura:** o worker na Oracle VM é o componente cuja queda o usuário sente primeiro e a plataforma vê por último — monitoração externa de uptime não é opcional, é a rede de segurança da peça mais artesanal da stack.
- **Maturidade:** Sentry é o padrão de fato de error tracking em Node/Next.js.

**Alternativa descartada:** **Datadog/New Relic** — observabilidade completa, custo incompatível com orçamento zero. **Self-hosted (Uptime Kuma, GlitchTip)** — monitorar a si mesmo na mesma VM que pode cair é vigiar o vigia; a independência do serviço externo é o ponto.

## CI/CD — GitHub Actions

**Escolha:** GitHub Actions (2.000 min/mês grátis) com pipeline único: lint + typecheck + testes (incluindo o **teste automatizado de isolamento de tenants**, critério de pronto do MVP) + `prisma migrate deploy` gated + deploy do web via Wrangler/OpenNext e do worker via build de imagem Docker puxada pela VM Oracle.

**Justificativa:**

- **Custo:** free tier folgado para a cadência do projeto.
- **Maturidade/integração:** o repositório já vive no GitHub; Actions elimina serviço externo e tem actions oficiais para Wrangler e Docker.
- **Continuidade:** mesmo fluxo do ev-tracker.

**Alternativa descartada:** **CircleCI/GitLab CI** — sem vantagem que justifique sair do ecossistema onde o código mora; qualquer migração futura é barata (YAML portável).

---

## Gateway de pagamento — Asaas

Componente com peso duplo: processa a **mensalidade dos tenants** (nossa receita) e a **cobrança dos clientes finais pelos tenants** (recurso do produto e segundo motor de receita via split).

### Comparativo (dados canônicos)

| Critério | **Asaas** | Mercado Pago | InfinitePay | Stripe |
|---|---|---|---|---|
| Pix | R$ 1,99/recebida (R$ 0,99 nos 3 primeiros meses; 100 Pix/mês grátis por subconta) | 0,99% | Grátis | Suportado |
| Boleto | R$ 1,99 | R$ 3,49 | — | — |
| Cartão de crédito | 2,99% + R$ 0,49 em assinaturas | 3,98–4,98% | 2,69% | ~4% |
| Assinaturas + Pix Automático | **Nativos** | Sem Pix Automático confirmado | Não | Pix Automático suportado |
| Subcontas white-label via API | **Sim** | Marketplace limitado | Sem infraestrutura de plataforma/subcontas | Connect, com compliance pesado no BR |
| Negativação Serasa | **Integrada** | Não | Não | Não |

### Decisão: Asaas

Três diferenciais **combinados** que nenhum concorrente reúne:

1. **Subcontas white-label via API** — cada tenant tem sua subconta; **o dinheiro do cliente final não passa pela nossa PJ** (limpeza contábil e regulatória) e o split de transação vira o segundo motor de receita (relevante no Premium: ~R$ 200–400/mês invisíveis por tenant ativo).
2. **Recorrência nativa com Pix Automático** — pós-Resolução BCB 422/2025, cobrança recorrente via Pix sem cartão é exatamente o meio de pagamento do público-alvo (salões, clínicas); ter isso nativo elimina meses de engenharia de régua.
3. **Negativação Serasa integrada** — funcionalidade de retenção para tenants com inadimplência (planos de clínica, mensalidades), impossível de construir por conta própria.

**Trade-off honesto:** o Pix por tarifa fixa (R$ 1,99) perde do percentual do Mercado Pago em tíquetes baixos e do gratuito da InfinitePay — mas nenhum dos dois oferece subcontas de plataforma nem Pix Automático nativo, e as 100 Pix/mês grátis **por subconta** cobrem a faixa de volume onde a tarifa fixa doeria.

**Anti lock-in:** todo acesso ao gateway passa pela camada **`PaymentProvider` em `packages/core/financeiro`** (interface própria: criar cobrança, assinatura, webhook de baixa, split). **Mercado Pago é o segundo driver planejado** — se o Asaas reprecificar, a troca é um driver, não uma reescrita.

**Alternativas descartadas:** **Mercado Pago** — Pix percentual competitivo, mas sem Pix Automático confirmado e marketplace limitado matam recorrência e subcontas, os dois pilares da decisão. **InfinitePay** — Pix grátis e cartão barato, porém sem infraestrutura de plataforma/subcontas: serve um lojista, não um SaaS que opera para N tenants. **Stripe** — tecnicamente o melhor Connect do mundo, mas cartão ~4%, e compliance/onboarding do Connect no Brasil é pesado para tenants pequenos (salão de bairro não passa fluidamente por KYC estilo Stripe).

---

## Assinatura eletrônica — motor próprio

**Escolha:** motor próprio de **assinatura eletrônica avançada**, fundamentado na **MP 2.200-2/2001, art. 10, § 2º** (validade de assinatura eletrônica acordada entre as partes) e na **Lei 14.063/2020** (classificação de assinatura eletrônica avançada). O STJ reconhece a executividade de contrato eletrônico não-ICP quando há trilha de evidências consistente.

**Mecânica (tudo auditado):**

1. Documento congelado + **hash SHA-256** registrado antes do envio;
2. **OTP via WhatsApp ou e-mail** para o signatário (prova de controle do canal);
3. **Trilha de evidências**: IP, user-agent, timestamps de cada etapa, id do OTP validado;
4. **Manifesto PDF** de assinatura (hash do documento + evidências + carimbo de data);
5. Registro completo no **AuditLog** (insert-only, sem `@relation` — regra inviolável 6).

**Justificativa:**

- **Custo:** zero por assinatura — contra R$ 1–3/doc dos SaaS de assinatura, custo que escalaria com o sucesso dos tenants (contratos de serviço, pacotes, termos de consentimento de clínicas).
- **Continuidade:** os blocos já existem no ecossistema herdado: OTP via canais (motor WhatsApp/e-mail), crypto (`crypto.ts`), AuditLog (kit LGPD).
- **Produto:** assinatura embutida no fluxo da conversa ("assine respondendo o código") é diferencial que nenhuma integração externa entrega com a mesma fluidez.
- **Maturidade jurídica:** para contratos de prestação de serviço entre particulares (o caso dos tenants), a assinatura avançada com trilha robusta é padrão de mercado consolidado (mesmo fundamento de Clicksign/ZapSign no modo não-ICP).

**Escape para ICP-Brasil:** tenants que exijam assinatura **qualificada** (ICP-Brasil) usam **ZapSign API sob demanda, com custo repassado** — não é o default, é exceção contratada.

**Alternativa descartada:** **ZapSign/Clicksign como motor padrão** — elimina o risco de implementação, mas cria custo por documento permanente, dependência num fluxo central do produto (contratos são recurso do plano Pro+) e não integra nativamente com a conversa omnichannel. Fica reduzida ao papel de ponte ICP-Brasil.

---

## Nota fiscal — emissor nacional (Fase 1) → Focus NFe (Fase 2)

**Escolha em duas fases:**

- **Fase 1 — emissor nacional gratuito do governo (manual).** Desde **01/2026**, o padrão **NFS-e nacional é obrigatório** (LC 214/2025) e o emissor público gratuito cobre a emissão. No MVP, o atende-ai organiza o dado (serviço prestado, valor, tomador) e o tenant emite manualmente no portal — custo zero, conformidade imediata, sem integração municipal legada.
- **Fase 2 — automação via Focus NFe.** API de emissão automática (**sem setup, sem fidelidade**), oferecida como **add-on com custo repassado** ao tenant que quiser NFS-e automática pós-pagamento (plano Premium).

**Justificativa:**

- **Custo/foco:** integração fiscal no MVP seria esforço alto num recurso que nenhum critério de pronto do MVP exige; a padronização nacional tornou o degrau manual aceitável (um portal só, não um por município).
- **Escalabilidade do modelo:** o repasse como add-on mantém a margem dos planos intacta — quem usa, paga.
- **Maturidade:** Focus NFe é player estabelecido de API fiscal no Brasil, com modelo comercial (sem setup/fidelidade) alinhado ao nosso orçamento.

**Alternativa descartada:** **automação fiscal já no MVP** (Focus NFe ou similar desde o dia 1) — adiaria o MVP por semanas para servir uma fração dos tenants beta; a emissão manual no portal nacional é ponte suficiente. **Integrações municipais diretas** — obsoletas pela LC 214/2025; seria construir para o passado.

---

## Síntese das linhas de força

1. **Um ecossistema, três deploys:** TypeScript de ponta a ponta; Cloudflare (web), Oracle VM (worker), Neon (estado). Zod em `packages/core` é o contrato entre eles.
2. **Postgres como única peça stateful:** dados, filas (pg-boss), auth-state Baileys e outbox no mesmo banco transacional — a razão de abandonar o driver Neon HTTP.
3. **Reuso agressivo do ev-tracker** nos componentes de maior risco (WhatsApp, IA, e-mail, LGPD, auth) — o custo de oportunidade de trocar qualquer uma dessas peças por "algo melhor" é maior que qualquer ganho marginal.
4. **Free tier permanente com porta de saída numerada:** cada componente tem limite, gatilho de migração e custo do próximo degrau documentados no doc 07; nenhum free tier em produção viola LGPD (veto explícito ao Gemini free) ou termos de uso comercial (veto ao Vercel Hobby).
5. **Anti lock-in nos pontos de dinheiro:** `PaymentProvider` no gateway, S3-compat no storage, Postgres puro no banco, motor próprio na assinatura.
