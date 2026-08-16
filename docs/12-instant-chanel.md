# 12 — Instant Channel: plano de ação do pivô omnichannel

**Sumário executivo.** Este documento redefine o produto deste repositório: o atende-ai deixa de ser um SaaS de agendamento com atendimento acoplado e passa a ser o **Instant Channel**, um SaaS **omnichannel multi-tenant** de atendimento e venda por conversa. O centro de gravidade muda de "cliente agenda pela conversa" para "cliente é atendido e **compra** pela conversa, em qualquer canal, falando com um agente de IA que a própria empresa criou e treinou". O módulo de agendamento fica **congelado** — continua funcionando para os tenants que o usam, não recebe evolução, e não entra no escopo das fases abaixo.

Nada da fundação é jogado fora: a tenancy fail-closed, o RBAC por escopos, a camada de conectores, o schema de atendimento, o outbox e a receita OpenNext/Cloudflare que os Blocos 0–3 entregaram **são** a base do Instant Channel. O que falta vem por duas vias: **cópia adaptada do ev-tracker** (motor de IA de 4 provedores, API aberta, design system, robustez do worker WhatsApp — código já endurecido em produção) e **construção nova** (conector Meta unificado, agentes de IA por tenant com base de conhecimento, catálogo com venda na conversa, hub de integrações ERP/CRM).

As 17 regras invioláveis do `CLAUDE.md` continuam valendo integralmente — inclusive, e principalmente, as três de IA e atendimento (propose-confirm, contexto nunca vindo do modelo, proativo só pela API oficial). Este plano não afrouxa nenhuma; ele as estende para novos canais e novas tools.

**Estado deste documento:** desenho aprovado; **Fase A concluída** (2026-08-16). Os docs 01–03 e 05–10 permanecem válidos como fonte de verdade das camadas que descrevem; o doc 04 (roadmap) tem seus Blocos 0–3 preservados e é substituído a partir do Bloco 4 pelas Fases A–I da seção 10 daqui.

> **Divergência já registrada.** A Fase A não portou o design system do ev-tracker, como esta seção 3.2 previa: portou o **chassi do Instant ERP**, porque ele já carregava a identidade da família Instant, medida e pronta. Motivo, escopo do que veio e o que ficou de fora: doc 11, linhas 9 e 10, e `packages/ui/AGENTS.md`.

---

## 1. Visão e posicionamento

### 1.1 O que é o Instant Channel

Uma empresa cliente (tenant) conecta seus canais — WhatsApp, Instagram, Messenger, webchat, Telegram, e-mail —, cria **agentes de IA** com persona e conhecimento próprios, atende tudo numa **inbox unificada** (referência visual: Neppo) e **vende dentro da conversa**: o agente consulta o catálogo, monta o pedido, o cliente confirma e recebe o Pix ou o link de pagamento na mesma janela de chat. Quando há um ERP conectado, o pedido nasce no ERP, o Pix é do ERP, e a baixa volta por webhook; quando não há, a plataforma resolve pelo gateway próprio.

Três coisas o definem, nesta ordem de importância:

1. **Uma conversa, muitos canais, uma memória.** O `IdentidadeCanal` já modelado (doc 02) é o pivô: o mesmo cliente falando por Instagram hoje e por WhatsApp amanhã é uma pessoa só, com um histórico só.
2. **Agentes que a empresa cria e treina sozinha.** Sem ticket de suporte, sem engenharia de prompt feita por nós: o tenant escreve a persona, sobe seus PDFs e FAQs, escolhe as ferramentas que o agente pode usar, testa no playground e publica. Publicar congela a versão.
3. **A conversa fecha negócio.** Catálogo, pedido, cobrança e baixa são parte do produto, não integração de terceiro parafusada depois.

### 1.2 Relação com o atende-ai — evolução, não fork

O monorepo `atende-ai` **é** o Instant Channel. O rebrand é progressivo (nome do painel e da marca na Fase A; nome do repo e domínio quando a grafia for decidida — ver 1.5). Não há fork, não há segundo produto, não há código duplicado.

O que muda de fato:

| | Antes (atende-ai) | Depois (Instant Channel) |
|---|---|---|
| Proposta | Agendamento para negócios de horário marcado, com atendimento omnichannel como canal de entrada | Atendimento e venda por conversa, multi-canal, para qualquer negócio |
| Módulo central | `agenda` | `atendimento` + `catalogo`/`financeiro` + `integracoes` |
| `agenda` | Carro-chefe | **Congelado**: funciona, não evolui, não recebe tools de IA no escopo inicial |
| Motor de IA | Previsto no Bloco 4, inexistente | Núcleo do produto, com agentes por tenant e base de conhecimento |

**"Congelado" tem significado operacional preciso:** o código de agenda (models, telas, booking pública, GCal pull) permanece no repositório e continua sendo mantido quanto a segurança, tenancy e LGPD — o que ele **não** recebe é funcionalidade nova, e nenhuma fase deste plano depende dele. Tools de IA de agenda (`consultarDisponibilidade`, `criarAgendamento`) ficam fora do registry inicial; se um tenant de horário marcado justificar comercialmente, elas voltam como extensão, não como pré-requisito.

### 1.3 Relação com o Instant ERP

Família de produtos "Instant": o **Channel é a boca** (atendimento, venda, cobrança conversacional); o **ERP é a retaguarda** (estoque, fiscal, financeiro, contratos). São produtos independentes com bancos independentes.

Regra estrutural, no mesmo espírito da regra 1 de tenancy: **a integração é contrato de API entre dois produtos — nunca acesso cruzado a banco, nunca dependência de código, nunca correlação de tenants feita pela plataforma.** O tenant do Channel informa a credencial do *seu* tenant no ERP; a plataforma não deduz nem cruza nada por conta própria.

Como o Instant ERP está na Onda 0, **o Channel define o contrato primeiro** (seção 7.3) e o ERP o implementa quando chegar às suas Ondas de financeiro/vendas. Nenhuma fase deste plano bloqueia esperando o ERP: o driver nasce contra um sandbox de fixtures, e o caminho de pagamento próprio (Asaas) cobre a lacuna.

### 1.4 Relação com o ev-tracker

Mesmo regime já decidido no doc 08: **cópia adaptada, nunca dependência compartilhada.** Os dois projetos divergem no eixo mais estrutural possível (single-tenant vs. multi-tenant; Neon HTTP sem transação vs. `pg` com transação; Vercel vs. Cloudflare), então compartilhar package seria acoplar produtos que precisam evoluir em ritmos diferentes.

O que o doc 08 já mapeou (crypto, session, e-mail, LGPD, base do worker, base da esteira) continua valendo. A seção 3 daqui **estende** aquela tabela com as peças que o doc 08 não cobria porque não existiam quando ele foi escrito: o motor de IA com 4 provedores e todas as suas guardas, a API aberta completa com OpenAPI, o design system, a central de conversas e a robustez do worker.

### 1.5 Grafia — decidido: **Instant Channel**

O nome de trabalho era "Instant Chanel", mas "Chanel" é marca mundialmente registrada no setor de moda: colisão de marca e SEO ruim eram consequências previsíveis. **Decisão (2026-08-16): "Instant Channel"**, grafia correta em inglês e sem colisão.

Vale para o painel, a marca e todo texto voltado ao usuário. O prefixo técnico de chaves de API continua `ichl_`, que funciona nas duas grafias. Os packages do monorepo seguem `@atende/*` por ora — dívida consciente, com gatilho registrado no doc 11 (renomeiam junto com o repositório e o domínio).

O arquivo deste documento mantém o nome `12-instant-chanel.md` para não quebrar os links já espalhados pelos outros docs e pelo `CLAUDE.md`.

---

## 2. Arquitetura alvo

### 2.1 Topologia

Nenhuma peça nova de infraestrutura. A topologia dos Blocos 0–3 é exatamente a do produto final:

```
┌───────────────────────── Cloudflare Workers (free) ─────────────────────┐
│  apps/web — Next 15.4 via OpenNext                                      │
│   · painel: inbox, estudio de agentes, catalogo, integracoes, config    │
│   · webhooks: valida assinatura -> enfileira (pg-boss) -> responde 200  │
│   · /api/v1 (API aberta): CRUD leve. NENHUM turno de IA aqui            │
│   · booking publica (agenda congelada) + pagina do widget de webchat    │
│   · KV: resolucao de tenant por hostname · Cron Trigger                 │
│   · R2: midia de conversa, imagens de catalogo, documentos de base      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  (unico ponto stateful)
┌────────────────────────────────▼────────── Neon (free) ─────────────────┐
│  Postgres + pg-boss (filas) + pgvector (RAG) + auth-state Baileys       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  consumidores / sockets
┌────────────────────────────────▼───── Oracle Cloud Always Free ─────────┐
│  apps/worker — Node sempre-ativo                                        │
│   · sockets Baileys multi-tenant (Map<canalId, socket>)  [ja existe]    │
│   · consumers: inbound, ia-turno, outbox-envio, sync-erp, ingest-rag,   │
│     reguas, retencao LGPD, plataforma                                   │
│   · hub SSE (inbox em tempo real, QR do Baileys, webchat)               │
│   · ffmpeg (midia -> ogg/opus) e STT                                    │
└─────────────────────────────────────────────────────────────────────────┘

Externos: Meta Graph API (WhatsApp oficial + Instagram + Messenger) ·
Telegram Bot API · Brevo/Resend · provedores de IA (Anthropic, Gemini,
OpenAI, Grok) · Asaas · Instant ERP (/v1 + webhooks) · ERPs/CRMs de mercado
```

### 2.2 Decisão central: turnos de IA rodam no worker, como consumer pg-boss

**Decisão: o turno de IA é o job `ia-turno` no `apps/worker`. O `apps/web` nunca executa um turno de modelo.**

Motivos, em ordem de peso:

1. **Limite físico, não preferência.** O plano gratuito do Cloudflare Workers dá **10 ms de CPU por request**. Um turno de IA é um laço de até 8 iterações de tool-use com orçamento total de 40 s, atravessando parsing de JSON, validação Zod, queries Prisma e, quando há áudio, STT. Mesmo sendo majoritariamente espera de I/O, o CPU acumulado não cabe. Não é otimizável — é incompatível.
2. **O pipeline já mora lá.** O inbound é processado por `apps/worker/src/consumers/inbound.ts`. O turno de IA é a continuação natural: `inbound → resolve identidade/conversa → estado bot_ia → publica job ia-turno`. Retry, backoff, timeout e dead-letter vêm prontos do pg-boss.
3. **A resposta sai pelo mesmo lugar.** Outbox e hub SSE já são do worker; a resposta da IA chega à inbox pelo mesmo caminho de qualquer outra mensagem, sem via alternativa.

**Parâmetros do job:**

| Parâmetro | Valor | Motivo |
|---|---|---|
| Orçamento do turno | 40 s (configurável por plano) | Herdado do `tentativa-ia.ts` do ev-tracker; abaixo dele o provedor reserva não teria tempo útil |
| Timeout do job | ≥ 60 s | Orçamento + margem de envio e persistência |
| `retryLimit` | 1 | Retry de turno de IA duplicaria resposta ao cliente. O dedupe correto é por mensagem inbound, não por job |
| Estouro de `maxIteracoes` | conta como **falha de compreensão** | 2 falhas → `fila_humano` (doc 05 §2.1) |

### 2.3 Tempo real

**Hub SSE no worker**, com **fallback de polling a 5 s** — o mesmo padrão validado na central do ev-tracker, que opera em produção com polling de 15 s na lista e 5 s na conversa aberta. O SSE serve três coisas: mensagens da inbox, QR do Baileys durante o pareamento, e o widget de webchat.

O fallback não é opcional nem temporário: SSE atravessa proxies corporativos mal, e a inbox precisa funcionar mesmo quando a conexão persistente cai.

### 2.4 Tenancy — o que muda: nada

As regras 1, 2 e 3 valem inalteradas. Especificamente para o que este plano acrescenta:

- Todo consumer novo roda sob `runWithTenant(ctx, fn)` com o `empresaId` **vindo do payload do job**, que por sua vez nasceu do **registro do canal** (a linha `Canal` que casou com o `phone_number_id`/`ig_user_id`/`page_id` do webhook) — nunca do conteúdo da mensagem, nunca de saída de modelo.
- Jobs que varrem múltiplos tenants (réguas de cobrança, retenção, ingestão agendada) continuam confinados a `apps/worker/src/consumers/plataforma.ts` com `prismaSemTenant` auditado — a allowlist da regra 1 não ganha entradas novas.
- O `ia-turno` recebe `{empresaId, conversaId, mensagemId, agenteVersaoId}`. O agente não escolhe seu tenant; o tenant escolhe seu agente.

---

## 3. Mapa de reúso

### 3.1 Adaptações recorrentes

Estas seis adaptações valem para **toda** peça da tabela 3.2. Descritas uma vez aqui, não repetidas linha a linha.

| | Adaptação | Regra |
|---|---|---|
| **A** | **Single-tenant → multi-tenant** | Toda config de linha única `id='default'` do ev-tracker (`ConfigIA`, `ConfigWhatsApp`, `ConfigEmail`, `ConfigLgpd`) vira registro por `empresaId` — ou por `canalId`/`agenteId` do tenant, quando o escopo for mais fino. Todo model ganha `empresaId` e toda unicidade vira composta (regra 2). Todo acesso roda sob a extension de tenancy. É o checklist do doc 08 §1, integral. |
| **B** | **Credenciais cifradas por tenant** | Toda credencial de terceiro (IA, Meta, ERP, CRM, gateway, SMTP) vai cifrada AES-256-GCM (`packages/core/crypto`, família hard-fail) em coluna do registro do tenant. **Fallback para variável de ambiente só para chaves da plataforma** (seção 5.6). Padrão de formulário herdado do ev-tracker: **campo vazio = manter a credencial atual**; a tela nunca relê o segredo. Segredo nunca sai em DTO, listagem ou log. |
| **C** | **Neon HTTP → `pg` com transação** | O ev-tracker convive com um adapter sem transação; aqui há transação real. Escritas multi-passo (proposta + auditoria + outbox) viram transações de verdade. **Os locks CAS são mantidos** — eles não existiam só por causa do Neon, existem contra duplo clique e webhook reentregue —, agora dentro de transação. Comentários do tipo "sem transação, usar Promise.all" morrem na porta de entrada. |
| **D** | **Zod 4 sem trocar dependência** | O gerador de OpenAPI do ev-tracker depende de `z.toJSONSchema`, só disponível no Zod 4. Este repo tem `zod ^3.25`, que **já embarca o v4 no subpath `zod/v4`**. Regra: **código novo ou portado importa de `zod/v4`**; o código existente permanece em v3; a migração total fica como dívida registrada, com gatilho (quando `packages/core` for majoritariamente v4). Zero big-bang, zero troca de dependência. |
| **E** | **Next 16 → 15.4** | Componentes portados (design system, central de conversas) quase não tocam APIs de framework. Revisar APIs assíncronas de request e remover recursos exclusivos do 16 se aparecerem. Impacto esperado: baixo. |
| **F** | **Guards e catracas** | Os scripts `*-guard.mjs` do ev-tracker (design, segurança, changelog) são portados e passam a rodar **no build command do Workers Builds** — que é onde mora o portão de qualidade real deste repo enquanto o GitHub Actions estiver desativado (divergência nº 1 do doc 11). |

### 3.2 Tabela mestra

Complementa a tabela do doc 08, que segue válida para crypto, session, e-mail, Google, LGPD, `whatsapp.ts`, base do worker e base da esteira.

| Peça | Origem (ev-tracker, salvo indicação) | Destino | Adaptação além de A–F |
|---|---|---|---|
| **Provedores de IA (4) + dispatcher** | `src/lib/esteira/agent.ts`, `provedores/{anthropic,gemini,openai-compat}.ts` | `packages/core/src/atendimento/ia/provedores/` | Nenhuma estrutural. O dispatcher `responder()` e o formato canônico `Anthropic.Tool[]` **são** o contrato. Preservar: prompt caching (Anthropic), o fix de schema OBJECT-vazio e o `thinkingConfig` (Gemini), o adapter único que serve OpenAI e Grok |
| **Resiliência de provedor** | `esteira/tentativa-ia.ts` | `packages/core/src/atendimento/ia/tentativa.ts` | `PROVEDORES_HOMOLOGADOS` deixa de ser constante de código e vira **política da plataforma + habilitação por tenant** (5.6); orçamento por plano |
| **Registry de tools + guardas** | `esteira/tools.ts`, `tool-context.ts`, `proposta-resumo.ts` (`empacotarResultadoTool`), `guarda-execucao.ts`, `pii-gate.ts`, `pii-core.ts` | `packages/core/src/atendimento/ia/tools/` | Tools de domínio Sankhya ficam fora; entram catálogo e ERP (5.5). **Guardas portadas sem afrouxar**: contexto nunca vem do modelo (regra 11), resultado de tool empacotado como dado (`<<<dados>>>`), guarda anti-alucinação de ação, PII em três modos por tenant |
| **Propose-confirm** | `esteira/confirmar-proposta.ts`, `proposta-resumo.ts` | `packages/core/src/atendimento/ia/propostas/` | Torna-se ciente de canal (doc 05 §4): vínculo por `conversaId + identidadeCanalId`, confirmação por botão ou parser conservador, índice único parcial garantindo **1 proposta PENDENTE por conversa** (doc 02 §5) |
| **STT** | `esteira/transcrever-core.ts` | `packages/core/src/atendimento/ia/stt.ts` + chamada no consumer `inbound` | Chave por tenant com fallback de plataforma; o áudio já está no R2 quando o STT roda |
| **API aberta (biblioteca inteira)** | `src/lib/api/{rota,resposta,registro,openapi,esquemas}.ts`, `api-auth-core.ts`, `api-auth.ts` | pipeline em `apps/web/src/lib/api/`, núcleo puro em `packages/core/src/api/` | Prefixo `evtk_live_` → **`ichl_live_`**. A chave resolve para uma **sessão de tenant** `{empresaId, escopos[]}` — mesmo truque do ev-tracker, que faz toda a autorização existente funcionar sem alteração. Rate limit de janela fixa com CAS mantido |
| **Portal do integrador** | `src/app/dev/` | `apps/web/src/app/dev/` | Público (fora do guard de sessão); exemplos com `ichl_live_` |
| **Worker: peças que faltam aqui** | `whatsapp-worker/src/{midia,acks,reenvio,crons}.ts` + watchdog e heartbeat do `index.ts` | `apps/worker/src/` (integrados ao `sockets/gestor.ts` existente) | Tudo passa a ser **por canal** (o gestor já é `Map<canalId, socket>`). `midia.ts` (ffmpeg → ogg/opus, tetos de tamanho) alimenta o R2; `reenvio.ts` vira job pg-boss; `crons.ts` vira cron do pg-boss. **O Baileys 7 deste repo prevalece** sobre o 6.7 do ev-tracker — os fixes de `@lid`, nono dígito e decodificação são **re-verificados** contra a v7, nunca assumidos |
| **Telefonia BR** | `src/lib/whatsapp-telefone.ts` + helpers de `utils.ts` | `packages/canais/src/telefone.ts` | Nenhuma — é código puro. Alimenta o merge de `IdentidadeCanal`. Carregar junto a regra do ev-tracker: **sufixo de 8 dígitos serve para agrupar conversa, jamais para decidir identidade** |
| **Autenticação de webhook por provedor** | `src/lib/whatsapp-webhook-auth.ts` | rotas em `apps/web/src/app/api/webhooks/` + validação em `packages/canais` | Allowlist fail-closed: Meta por HMAC `X-Hub-Signature-256` com `timingSafeEqual`; Baileys por segredo de worker; Telegram por secret token. **Driver Evolution não é portado** (doc 08 §4) |
| **Admissão de inbound** | `src/lib/whatsapp-inbox.ts` (`admitir()`: dedupe + lease + CAS) | absorvido pelo consumer `inbound` | O dedupe já existe aqui como `@@unique([empresaId, canalId, idExterno])`; o lease vira `FOR UPDATE SKIP LOCKED` natural do pg-boss. **Manter o teste**: reentrega 3× produz 1 efeito |
| **Sessão com takeover** | `src/lib/whatsapp-sessao-core.ts` (modo bot/humano) | já modelado como `EstadoConversa` | A máquina de estados do doc 05 §2 é superset do takeover do ev-tracker. Portar só os testes de transição que faltarem |
| **Central de conversas (UI)** | `src/app/(app)/whatsapp/`: `ConversasWa.tsx`, `ComposerWa.tsx`, `AudioWa.tsx`, `NovaConversaWa.tsx`, `PainelConexaoBaileys.tsx`, `ConfigCanalWa.tsx`, `useAvisoNovaMensagem.ts` | `apps/web/src/app/(painel)/inbox/` + `apps/web/src/components/inbox/` | De três abas mono-canal para inbox omnichannel de três colunas (seção 9); polling → SSE com fallback; ícone e cor por `TipoCanal`. `PainelConexaoBaileys` (QR + diagnóstico ponta a ponta) vai quase intacto para a tela de canais |
| ~~**Design system**~~ — **substituído na execução** | ~~ev-tracker~~ → **`@instanterp/ui` (Instant ERP)** | `packages/ui` (chassi + componentes) e `apps/web/src/app/globals.css` (tokens de marca) | **Feito na Fase A.** O ERP já tinha a identidade da família Instant pronta e medida — portar do ev-tracker significaria inventar uma paleta e deixar os dois produtos visualmente desconexos. Vieram chassi, base, componentes, formato e status (+ `@atende/dinheiro`); ficaram de fora `escopo/` (seletor de empresa na UI viola a regra 3), `telas/`/`tabela/`/`consulta/`/`referencia/` (dependem dele), `formulario/` (domínio fiscal) e `graficos/` (Fase D). Detalhe em `packages/ui/AGENTS.md` e doc 11 §9–10 |
| **Processo e qualidade** | `scripts/{seguranca-guard,changelog-guard,release}.mjs`, `verify`, `handoff/` | `scripts/` na raiz do monorepo | Adaptar ao build command do Workers Builds (adaptação F) |
| **Tenancy, conectores + degradação, schema de atendimento, outbox, gestor Baileys, RBAC de 24 escopos, receita OpenNext** | **este repo — já existe** | mantém | — |

### 3.3 O que explicitamente não é portado

Reafirmando o doc 08 §4, e acrescentando: driver Neon HTTP e seus workarounds; Evolution API; base de conhecimento e prompts de domínio Sankhya (`knowledge.ts`, `tools-knowledge.ts` e os JSONs); telas de domínio do ev-tracker (forecast, chamados, metas, books); `db push` em qualquer forma.

---

## 4. Conectores por canal

### 4.1 Conector Meta unificado

**Fato que define o desenho:** WhatsApp Cloud API, Instagram Messaging e Messenger Platform são a **mesma Graph API, o mesmo app Meta e o mesmo webhook**. O payload difere no campo `object` (`whatsapp_business_account` | `instagram` | `page`). Tratá-los como três integrações separadas triplicaria custo de manutenção sem ganho.

```
packages/canais/src/meta/
  graph.ts             — cliente da Graph API (versao fixada): envio, midia, templates
  hmac.ts              — X-Hub-Signature-256 + timingSafeEqual
  webhook.ts           — parse do envelope por `object` -> despacha ao conector
  midia.ts             — download de midia (URLs da Meta expiram em minutos) -> R2
  janela.ts            — janela de 24h por identidade + exigencia de template fora dela
  whatsapp-oficial.ts  — implements Conector (whatsapp_oficial)
  instagram.ts         — implements Conector (instagram)
  messenger.ts         — implements Conector (messenger)
```

**Um endpoint só:** `apps/web/src/app/api/webhooks/meta/route.ts` — valida HMAC, resolve `empresaId`/`canalId` **pelo registro do canal** (a linha `Canal` cujo `phone_number_id`/`ig_user_id`/`page_id` casa), enfileira e responde 200. O `empresaId` jamais vem do payload: é a regra 3 aplicada ao inbound.

**Credenciais por tenant** em `Canal.configCifrada` (tokens de página / WABA). Onboarding pela tela de canais: **Embedded Signup** para WhatsApp, Facebook Login for Business para Instagram e Messenger.

**Janela de 24 h e template** são aplicados **no conector**, para os três tipos Meta (doc 05 §7.3) — nunca no motor.

### 4.2 Ordem de entrega

| # | Canal | Por que nesta posição |
|---|---|---|
| 1 | `whatsapp_baileys` | Já existe; recebe as peças de robustez do worker do ev-tracker (acks, reenvio, mídia, watchdog) |
| 2 | `whatsapp_oficial` | Destrava proativo (lembretes, régua, recibo) e o plano pago. **O app review da Meta é o lead time mais longo** — registrar o app imediatamente, como já mandava o Bloco 0 |
| 3 | `instagram` + `messenger` | Custo marginal baixo depois do conector unificado: mesmo app, mesmo webhook, review incremental de permissões |
| 4 | `webchat` | Widget próprio embutível + SSE. É também o **playground** de teste dos agentes no estúdio (seção 9) |
| 5 | `telegram` | Bot API, trivial |
| 6 | `email` (inbound) | Webhook do Brevo; a cascata de envio já está desenhada (doc 08 §3.5) |

### 4.3 Capacidades, degradação e anti-ban

A tabela de capacidades e as regras de degradação do doc 05 §1.3–1.4 permanecem a especificação. `packages/canais/src/degradacao.ts` já implementa e testa o padrão: botões viram lista numerada com parser tolerante, lista vira sequência, mídia sem suporte vira link do R2, typing vira no-op. **Conectores novos só declaram `capacidades`; o motor não muda uma linha.**

**Anti-ban (regra 12), inalterado e estrutural:** envio proativo só pela API oficial, com template aprovado. O conector Baileys **não expõe método proativo** — a restrição é de interface, verificada por tipo e em runtime. Régua de cobrança e lembretes usam exclusivamente `whatsapp_oficial`, `email` ou `telegram` (após `/start`).

---

## 5. Motor de IA e agentes por tenant

### 5.1 Conceito

O tenant cria **N agentes** ("Vendedora da loja", "Suporte técnico", "Recepção"), cada um com persona, provedor e modelo, tools habilitadas, bases de conhecimento vinculadas, canais e horário de atuação. O agente é o "quem" do estado `bot_ia`. A máquina de estados da Conversa (doc 05 §2) não muda — ganha apenas a resolução de *qual* agente atende.

### 5.2 Modelo de dados

```prisma
model AgenteIA {
  id            String    @id @default(cuid())
  empresaId     String
  nome          String
  ativo         Boolean   @default(true)
  versaoAtivaId String?   // VersaoAgente publicada em uso
  criadoEm      DateTime  @default(now())
  deletedAt     DateTime?
  @@unique([empresaId, nome])
}

// Publicar = congelar. Mesmo desenho de FluxoArvore/VersaoFluxo (doc 05 §3.1):
// conversas em andamento terminam na versao em que comecaram.
model VersaoAgente {
  id               String    @id @default(cuid())
  empresaId        String
  agenteId         String
  numero           Int
  status           String    // rascunho | publicada | arquivada
  persona          String    // system-prompt do tenant, dentro de moldura anti-injection
  provedor         String    // anthropic | gemini | openai | grok
  modelo           String
  toolsHabilitadas Json      // string[] — validada contra o registry, nunca aceita cega
  basesVinculadas  Json      // string[] de BaseConhecimento.id (snapshot no publicar)
  horarioAtuacao   Json?     // janelas por dia da semana, no fuso da Unidade
  handoffConfig    Json?     // gatilhos de palavra, limite de falhas, fila destino
  publicadaEm      DateTime?
  @@unique([empresaId, agenteId, numero])
}

model BaseConhecimento {
  id        String @id @default(cuid())
  empresaId String
  nome      String
  @@unique([empresaId, nome])
}

model DocumentoConhecimento {
  id           String   @id @default(cuid())
  empresaId    String
  baseId       String
  origem       String   // upload | faq | url
  titulo       String
  ponteiroR2   String?  // arquivo original no R2
  urlFonte     String?
  status       String   // pendente | processando | indexado | erro
  hashConteudo String   // reingestao so do que mudou
  atualizadoEm DateTime @updatedAt
  @@index([empresaId, baseId])
}

model ChunkConhecimento {
  id          String @id @default(cuid())
  empresaId   String
  baseId      String
  documentoId String
  texto       String
  metadados   Json   // titulo, secao, urlFonte
  embedding   Unsupported("vector(768)")  // pgvector; indice HNSW cosseno em SQL manual
  @@index([empresaId, baseId])
}
```

**Vínculo com a conversa:** `Canal.agentePadraoId` (agente padrão do canal) e `config.agenteId` no nó `handoff_ia` da árvore (a árvore escolhe o especialista). `Conversa` ganha `agenteVersaoId String?`, congelando a versão em uso — exatamente como já faz com `fluxoVersaoId`.

### 5.3 Treinamento pela interface (RAG)

Generaliza a arquitetura já desenhada no ev-tracker (`PLANO_TREINAMENTO_ESTEIRA_IA.md`), agora self-service e por tenant. Todo o processamento é do worker, em jobs pg-boss:

1. O tenant envia documento, FAQ ou URL no estúdio → upload direto ao R2 → `DocumentoConhecimento` em `pendente` → job `ingest-rag`.
2. O job extrai texto (md/pdf/html), faz **chunking por heading, ~500–1000 tokens com overlap**, gera embeddings (**Gemini `text-embedding-004`** como padrão; chave do tenant ou da plataforma), grava `ChunkConhecimento` e marca `indexado`.
3. A tool **`buscarConhecimento(consulta)`** embeda a consulta, busca top-k por cosseno **filtrado por `empresaId` e pelas bases da versão do agente**, e devolve trechos com fonte — **empacotados por `empacotarResultadoTool`**: documento de tenant é entrada não confiável tanto quanto mensagem de cliente.
4. Reingestão decidida por `hashConteudo`. O painel mostra documentos, chunks e data da última ingestão.

**Regra que não se negocia:** números críticos — preço, disponibilidade, estoque, status de pedido — **vêm sempre de tools determinísticas**, nunca do texto de um documento indexado. O RAG responde "como funciona a garantia"; o catálogo responde "quanto custa".

### 5.4 Execução do turno

O consumer `ia-turno` porta a esteira do ev-tracker com todas as guardas intactas:

```
dispatcher responder() (4 provedores)
  -> laco de tool-use (max. 8 iteracoes)
  -> tentativa-ia: orcamento 40s, classificacao de erro, provedor reserva
  -> guarda-execucao: modelo afirmou acao que nao executou? bloqueia/reformula
  -> pii-gate por tenant (off | observar | mascarar) na fronteira do provedor
  -> escrita SEMPRE via PropostaAcao (regra 10)
  -> resposta pelo outbox -> conector -> SSE
```

Confirmação de proposta por canal conforme doc 05 §4.2. Contexto de tool vindo da conversa autenticada, nunca do texto do modelo (regra 11).

### 5.5 Tools iniciais

| Domínio | Leitura | Escrita (sempre via proposta) |
|---|---|---|
| Conversa | `buscarConhecimento`, `iniciar_fluxo`, `chamar_humano` | — |
| Catálogo / venda | `buscarCatalogo`, `detalheItem` | `montarPedido`, `gerarCobranca` |
| ERP (se conectado) | `erpBuscarProdutos`, `erpStatusPedido`, `erpStatusCobranca` | `erpCriarPedido`, `erpGerarPix` |

**Sem tools de agenda** no escopo inicial — módulo congelado (1.2).

`toolsHabilitadas` da versão do agente filtra o registry; a catraca `tools-schema.test.ts` é portada, de modo que mudança em schema de tool exija atualização consciente do teste.

### 5.6 Provedores por tenant, homologação e billing

- **`ConfigIAEmpresa`** (por `empresaId`): chave cifrada por provedor (padrão B: vazio = manter), provedor e modelo padrão, teto mensal de tokens.
- **Fallback para chaves da plataforma** quando o tenant não traz as próprias. Isso exige **metering**: model `UsoIA { empresaId, agenteId?, conversaId?, provedor, modelo, tokensEntrada, tokensSaida, custoEstimadoCentavos, criadoEm }`, gravado a cada turno. Alimenta o painel de consumo do tenant e o excedente por conversa do doc 06.
- **Teto fail-closed:** estourado o limite do plano, o turno recusa com mensagem clara e a conversa vai para `fila_humano` — nunca silencia, nunca gasta além.
- `PROVEDORES_HOMOLOGADOS` deixa de ser constante e vira tabela de plataforma (habilitação por provedor e modelo), com a mesma semântica fail-closed do ev-tracker: um clique no painel não desfaz uma homologação.
- **LGPD:** produção nunca usa free tier de provedor de IA (veto explícito do doc 03 — os termos autorizam uso do conteúdo para melhoria do produto). Transferência internacional (art. 33) tratada no DPA do onboarding.

---

## 6. Catálogo e venda na conversa

### 6.1 Modelo

```prisma
model ItemCatalogo {
  id              String    @id @default(cuid())
  empresaId       String
  tipo            String    // produto | servico
  nome            String
  descricao       String?
  precoCentavos   Int       // regra 16
  imagens         Json?     // ponteiros do R2
  ativo           Boolean   @default(true)
  idExternoErp    String?   // correlacao com ERP; a fonte e MapeamentoEntidade
  deletedAt       DateTime?
  @@unique([empresaId, nome])
}
```

`Pedido`, `ItemPedido`, `Cobranca` (com `pixCopiaECola`), `Assinatura` e `ReguaCobranca` **já estão desenhados no doc 02 §6** — este plano os materializa sem redesenhar.

**Estados do `Pedido`:** `rascunho → proposto → confirmado → aguardando_pagamento → pago → cancelado | expirado`. Transições auditadas; quando a origem é IA, `confirmado` só acontece pela execução determinística de uma `PropostaAcao`.

### 6.2 Fluxo

1. O agente usa `buscarCatalogo` e **oferta** (texto + imagem do R2; a degradação por canal cuida do resto).
2. No fechamento, `montarPedido` gera uma `PropostaAcao` legível — *"2× Corte + 1× Hidratação — R$ 180,00. Confirma?"* — e a confirmação vem pelo mecanismo do canal.
3. A execução determinística cria `Pedido` + `Cobranca` pelo caminho de pagamento configurado e **entrega o Pix copia-e-cola (ou link) na conversa**.
4. **Baixa:** webhook (Asaas ou ERP) → `WebhookFinanceiroEvento` com idempotência estrutural (doc 02 §6) → `Pedido` para `pago` → recibo pela API oficial ou e-mail → evento de outbox para régua, ERP e CRM.

### 6.3 Caminhos de pagamento

| Caminho | Quando | Fase |
|---|---|---|
| **Instant ERP conectado** — o Channel chama `erpCriarPedido`/`erpGerarPix`; o ERP fatura, gera o Pix e notifica a baixa | Tenant usa o Instant ERP (pedido vive no ERP, espelho no Channel) | G |
| **Asaas nativo** — driver de `PaymentProvider`, subconta white-label por tenant | Tenant sem ERP | F |
| **Stripe, Mercado Pago, Itaú, Santander e outros** — drivers do mesmo `PaymentProvider` | Demanda comercial | **Fase 2 do produto** |

---

## 7. Hub de integrações ERP e CRM

### 7.1 Novo package `packages/integracoes`

Mesmo padrão anticorrupção de `packages/canais`: **nada fora deste package importa SDK ou HTTP de ERP/CRM.**

```ts
interface ConectorERP {
  tipo: TipoErp; // instant_erp | sankhya | omie | bling | tiny | conta_azul | totvs
  capacidades: {
    produtos: boolean; servicos: boolean; pedidos: boolean; contratos: boolean;
    cobrancaPix: boolean; linkPagamento: boolean; baixaWebhook: boolean; regua: boolean;
  };
  buscarProdutos(filtro): Promise<ProdutoErp[]>;
  buscarServicos(filtro): Promise<ServicoErp[]>;
  buscarCliente(documentoOuTelefone): Promise<ClienteErp | null>;
  criarPedido(pedido): Promise<{ idExterno: string }>;
  criarContrato(contrato): Promise<{ idExterno: string }>;
  gerarCobranca(cobranca): Promise<{ idExterno; pixCopiaECola?; linkPagamento?; vencimento }>;
  statusCobranca(idExterno): Promise<StatusCobrancaErp>;
  receberWebhook(payload: unknown): Promise<EventoErpNormalizado[]>;
}

interface ConectorCRM {
  tipo: TipoCrm; // ploomes | rd_station | pipedrive | hubspot
  buscarContato(chave): Promise<ContatoCrm | null>;
  criarContato(contato): Promise<{ idExterno: string }>;
  criarOportunidade(op): Promise<{ idExterno: string }>;
  registrarAtividade(atividade): Promise<void>;
}
```

Regras espelhadas dos canais: **capacidade ausente degrada na UI** (a funcionalidade some, com aviso do porquê) e o motor não se adapta; formatos canônicos (`ProdutoErp`, `EventoErpNormalizado`, `ContatoCrm`) são schemas Zod em `packages/core`, contrato entre `apps/web` e `apps/worker` (regra 14).

### 7.2 Models de suporte

```prisma
model IntegracaoExterna {
  id                   String  @id @default(cuid())
  empresaId            String
  categoria            String  // erp | crm | pagamento
  tipo                 String  // instant_erp | sankhya | omie | ...
  credenciaisCifradas  String  // AES-256-GCM
  webhookSecretCifrado String? // valida o inbound do provedor
  status               String  // conectada | erro | pausada
  @@unique([empresaId, categoria, tipo])
}

model MapeamentoEntidade { // correlacao id local <-> id externo = idempotencia do sync
  id           String @id @default(cuid())
  empresaId    String
  integracaoId String
  entidade     String // produto | cliente | pedido | cobranca | contrato
  idLocal      String
  idExterno    String
  @@unique([empresaId, integracaoId, entidade, idLocal])
  @@unique([empresaId, integracaoId, entidade, idExterno])
}
```

Sincronização por fila (consumer `sync-erp`): jobs idempotentes ancorados em `MapeamentoEntidade`, retry com backoff, `SincronizacaoLog` alimentando o painel. Webhooks de ERP entram por `apps/web/src/app/api/webhooks/integracoes/[integracaoId]/route.ts` — valida HMAC com o segredo do tenant, enfileira, responde 200.

### 7.3 Contrato com o Instant ERP

Definido aqui, implementado pelo ERP nas suas Ondas de vendas e financeiro. Alinhado ao que a arquitetura do Instant ERP já prevê (API pública com chave `iep_live_` e webhooks assinados) — nada é inventado, só sequenciado.

**Do lado do ERP:**

- **REST `/v1`**, autenticado por chave escopada por tenant: `GET /v1/produtos`, `GET /v1/servicos`, `GET|POST /v1/parceiros`, `POST /v1/pedidos` (com `Idempotency-Key`), `POST /v1/contratos`, `POST /v1/cobrancas` (retorna `pixCopiaECola` e/ou link), `GET /v1/cobrancas/{id}`.
- **Webhooks assinados** HMAC-SHA256 sobre `timestamp.payload`, com dois segredos ativos para rotação sem janela de queda: `cobranca.paga`, `cobranca.cancelada`, `pedido.faturado`, `contrato.ativado`.

**Divisão de responsabilidade:** a **régua de cobrança é executada pelo Channel** — ele tem os canais e as regras de anti-ban; o ERP fornece os fatos (vencimentos, baixas). As etapas da régua são as `ReguaCobranca`/`EtapaReguaCobranca` do doc 02 (D-3 / D0 / D+3, com escalonamento humano).

**Enquanto o ERP não chega lá:** o driver `instant_erp` nasce contra um **sandbox de contrato** (fixtures + servidor falso nos testes), e o Asaas cobre pagamento. O contrato é versionado em `docs/contratos/erp-chanel-v1.md`, espelhado nos dois repositórios.

### 7.4 Ordem dos adapters

**ERPs:** `instant_erp` (define o contrato) → **`sankhya`** (domínio conhecido, vantagem competitiva real) → `omie` / `bling` / `tiny` (APIs REST públicas e maduras, mercado PME).

**CRMs:** `ploomes` (integração já conhecida) → `rd_station` → `pipedrive`.

Cada adapter é uma unidade de trabalho independente depois que o package existe — bom candidato a paralelização.

---

## 8. API aberta

Port da biblioteca do ev-tracker (mapa em 3.2), com estas especificidades:

**Chave:** `ichl_live_<identificador>_<segredo>`. SHA-256 do segredo no banco, comparação com `timingSafeEqual`, escopos planos **sem hierarquia** (`conversas:write` não implica `conversas:read`). `ApiClient`, `ApiKey`, `ApiIdempotencia` e `RateLimit` ganham `empresaId`; a chave resolve para uma sessão de tenant, reaproveitando toda a autorização por escopo já existente.

**Pipeline por rota** (`rotaApi()`): CORS → autenticação → rate limit (por chave, **fail-closed**) → validação Zod (`zod/v4`) → idempotência (POSTs) → handler. Envelope `{dados, meta}` / `{erro}` com os 13 códigos estáveis. `registro.ts` é fonte única: alimenta o `openapi.json`, o portal `/dev` e um teste de drift. **Catraca portada:** rota sob `/api/v1` que não passe por `rotaApi()` reprova o build.

**Endpoints v1 iniciais:** `GET|POST /v1/conversas`, `GET|POST /v1/conversas/{id}/mensagens`, `GET /v1/contatos`, `GET /v1/catalogo`, `GET /v1/pedidos`, `POST /v1/webhooks`.

**Ponto que não é detalhe:** o POST de mensagem **passa pelo mesmo roteador de envio** do painel. Janela de 24 h e anti-ban valem para o integrador exatamente como valem para o atendente humano; tentativa de proativo por Baileys retorna erro estruturado, não uma mensagem enviada.

**Webhooks de saída:** `WebhookSaida { empresaId, url, eventos[], secretCifrado }`, entregues pelo worker com HMAC, retry exponencial por 24 h e DLQ com replay — **o mesmo dialeto de webhook do Instant ERP**, de propósito: os dois produtos falam a mesma língua.

---

## 9. UI e UX

### 9.1 Fundação: o design system vem primeiro — **entregue**

O `apps/web` não tinha design system: o estilo era objeto `CSSProperties` inline, divergência real frente ao doc 03. A Fase A resolveu isso com o **chassi do Instant ERP** — e não com o do ev-tracker, como este documento previa originalmente.

O que existe hoje:

- **`packages/ui`** (`@atende/ui`) — cópia adaptada de `@instanterp/ui`: a folha `estilos/chassi.css`, os ícones (com o vocabulário de atendimento acrescentado: `conversa`, `agente`, `antena`, `livro`, `plugue`, `engrenagem`, `chave`), os componentes de apoio (Botao, Badge, Chip, BuscaLocal, Kpi, AbasInternas, Estados, Modal, Toast) e os formatadores pt-BR. Duas catracas prendem as armadilhas da cópia: nenhum import relativo com extensão `.js` (derruba o build do web inteiro — doc 11) e nenhum import remanescente de `@instanterp/*`.
- **`packages/dinheiro`** (`@atende/dinheiro`) — aritmética monetária sobre inteiros, com os 58 testes do ERP. Serve à regra 16 e à Fase F.
- **Tokens de marca** em `apps/web/src/app/globals.css`: navy, azul elétrico e roxo em oklch, com os contrastes AA anotados linha a linha. **Tema escuro é o padrão**, aplicado por script no `<head>` antes da primeira pintura.

**Por que a identidade é compartilhada com o ERP e o código não:** um cliente que usa os dois produtos precisa ver dois produtos irmãos — mas os repositórios evoluem em ritmos diferentes, então vale o mesmo regime do doc 08: cópia adaptada, nunca dependência.

As telas existentes (agenda, clientes, configurações) migram **oportunisticamente** — quando forem tocadas por outro motivo. Sem big-bang. `src/modules/agenda/estilos.ts` é o que resta da fundação anterior e morre com a última tela que o usa.

### 9.2 Inbox omnichannel — três colunas

`apps/web/src/app/(painel)/inbox/`:

| Coluna | Conteúdo |
|---|---|
| **Lista de conversas** | Filtros por canal, estado, fila e atendente; contador de não lidas; ícone e cor por `TipoCanal`; busca. Alimentada por SSE com fallback de polling |
| **Timeline** | Mensagens de todos os tipos (mídia do R2, áudio com waveform, propostas com status), indicador do motor ativo (árvore / IA / humano), ações Assumir · Devolver ao bot · Encerrar (máquina de estados do doc 05 §2), composer com texto, arquivo, **nota de voz** e respostas rápidas |
| **Contexto do contato** | Dados do `Cliente`, identidades por canal (com sugestão de merge via `IdentidadeCanal`), tags, timeline de eventos (pedidos, cobranças) e **cartões de integração**: pedidos e títulos do ERP, deals do CRM, quando conectados |

`useAvisoNovaMensagem` (título da aba, bipe, Notification API) é portado como está.

### 9.3 Demais telas

| Tela | Conteúdo | Reúso |
|---|---|---|
| **Canais** | Cards por canal. Baileys: QR + diagnóstico ponta a ponta. Meta: Embedded Signup + status de verificação e janela. Telegram: token. Webchat: snippet de embed. E-mail: instruções Brevo | `ConfigCanalWa`, `PainelConexaoBaileys` |
| **Estúdio de agentes** | Lista; editor de versão (persona, provedor/modelo, tools com toggles, bases, horário, handoff); **playground** (webchat interno contra a versão rascunho); publicar e rollback; métricas (resolução, handoffs, custo) | novo, sobre os primitivos |
| **Base de conhecimento** | Upload / FAQ / URLs, status de ingestão, chunks por documento, reingerir | novo |
| **Catálogo** | CRUD de itens, imagens no R2, preço, origem ERP (somente leitura quando sincronizado) | `DataTable`, `Field` |
| **Integrações** | Cards de ERP, CRM e pagamento: conectar (credenciais cifradas), status de sync, log, testar conexão | novo |
| **API keys e portal `/dev`** | Gestão de chaves e escopos por tenant; portal público do integrador | port do ev-tracker |
| **Configurações do tenant** | IA (chaves por provedor, tetos, modo PII), LGPD, réguas, white-label | padrões do ev-tracker |

---

## 10. Fases

Os Blocos 0–3 do doc 04 permanecem válidos e em vigor. **Do Bloco 4 em diante, o roadmap é substituído por estas fases.** Os blocos de agenda avançada do doc 04 (GCal bidirecional, builder visual de agenda) saem do caminho crítico junto com o congelamento do módulo.

Cada fase cabe em poucas sessões de desenvolvimento, termina **navegável** e tem critério de pronto objetivo.

| Fase | Entrega | Pronto quando |
|---|---|---|
| ✅ **A — Fundação visual e rebrand** *(concluída em 2026-08-16)* | Chassi `@atende/ui` + `@atende/dinheiro` (cópia adaptada do Instant ERP) + Tailwind 4 + tokens de marca com tema escuro sem piscar; shell do painel com a marca **Instant Channel** e a navegação do produto; `/inbox` esqueleto em três colunas lendo `Conversa`/`Mensagem` reais | Feito: build de produção verde com `/inbox` gerada, typecheck limpo nos três pacotes, 92 testes novos (34 do chassi + 58 do dinheiro) e suíte do monorepo sem regressão. `design-guard` **não** entrou — as catracas equivalentes viraram teste (`packages/ui/tests/chassi.test.tsx`), que roda no mesmo portão e prende as armadilhas reais desta cópia |
| 🟡 **B — Inbox operacional** (fecha o Bloco 3) — *em andamento* | Lista + timeline + composer + takeover; SSE com fallback; robustez do worker (acks, reenvio, mídia → R2 com ffmpeg, watchdog); mídia nos dois sentidos | **Feito:** `/inbox/[id]` com timeline (origem por mensagem: cliente/fluxo/IA/atendente), composer (Enter envia), assumir · devolver à fila · encerrar · reabrir, painel de contato com identidades por canal; polling condicional por assinatura (`pulso.ts` — só repinta quando muda, pausa em aba escondida); **recibos de entrega** ✓/✓✓/lida com regra de não-retrocesso; **correção do inbound**: status/stories deixaram de virar conversa (ver abaixo). **reenvio** com 3 tentativas (0/2s/8s) só para erro transitório; **watchdog por canal** (derruba socket travado para a reconciliação reabrir, sem matar o processo e sem derrubar os outros tenants). **Pendente:** mídia (bloqueada — sem binding R2), SSE (bloqueado — worker sem host público, doc 11) e o claim do outbox, que exige migration coordenada (ver `apps/worker/AGENTS.md`) |
| 🟡 **C — Motor de IA e propose-confirm** — *em andamento* | Port da esteira (4 provedores, tentativa, guardas, PII, STT); models `PropostaAcao`, `FluxoArvore`, `VersaoFluxo`, `ResumoConversa`, `FeedbackIA`; consumer `ia-turno`; árvore por templates; transições completas | **Feito (1ª etapa):** `packages/core/src/atendimento/ia/` — o núcleo de decisão puro: portão de PII em três modos com validação de DV, orçamento/reserva/classificação de erro, guarda anti-injection e guarda anti-alucinação de ação, e o contrato `tipos.ts` que os adapters vão cumprir. 17 testes. **Pendente:** adapters dos 3 SDKs + dispatcher; models de IA (**exigem migration coordenada** — o build não roda `migrate deploy`); consumer `ia-turno`; árvore |
| **D — Agentes por tenant e conhecimento** | `AgenteIA`, `VersaoAgente`, `BaseConhecimento`, `Documento`, `Chunk` + pgvector; job `ingest-rag`; tool `buscarConhecimento`; estúdio com playground; `ConfigIAEmpresa` e `UsoIA` | Tenant cria agente, treina com um PDF ou FAQ, publica, e o agente responde citando a base — no playground e num canal real; custo por tenant visível no painel |
| **E — Conector Meta unificado** | `packages/canais/src/meta/` (oficial + Instagram + Messenger); Embedded Signup; janela de 24 h; templates; merge de identidade | Conversa completa nos três canais Meta; proativo bloqueado fora de janela sem template; E2E de merge com `AuditLog` |
| **F — Catálogo e venda na conversa** | `ItemCatalogo` + `Pedido`/`Cobranca`; tools de catálogo; `PaymentProvider` com driver Asaas (subconta por tenant); baixa idempotente; recibo | Agente oferta item, fecha pedido via proposta, entrega Pix, baixa em < 1 min no sandbox; reentrega 3× produz 1 baixa |
| **G — Hub ERP/CRM e contrato Instant ERP** | `packages/integracoes`; driver `instant_erp` contra sandbox; `docs/contratos/erp-chanel-v1.md`; cartões de contexto na inbox; régua de cobrança | Pedido criado na conversa aparece no sandbox do ERP; webhook de baixa simulado baixa o pedido; régua dispara nos offsets com relógio simulado e **nada proativo sai por Baileys** |
| **H — API aberta v1 e portal `/dev`** | Biblioteca portada; chaves `ichl_live_`; endpoints v1; webhooks de saída; catraca de rota | Spec sem drift no CI; chave sem escopo → 403; estouro → 429 com `Retry-After`; envio proativo via API respeita o anti-ban |
| **I — Conectores restantes e expansão** | Webchat (widget + SSE), Telegram, e-mail inbound; gateways da Fase 2; adapters de ERP/CRM na ordem de 7.4 | Conversa completa nos canais novos; segundo gateway operando atrás do mesmo `PaymentProvider` |

**RLS do Postgres** (Bloco 7 do doc 04) entra **antes da Fase H** — mesma lógica do doc 04 §3: endurecer antes de expandir superfície pública.

**Explicitamente fora, até depois da Fase I:** gateways bancários além dos listados, voz e telefonia, marketplace de templates, app nativo, white-label total. Continuam no anti-escopo do doc 04.

---

## 11. Riscos e decisões em aberto

| # | Risco / decisão | Detalhe | Encaminhamento |
|---|---|---|---|
| 1 | **Nome "Instant Channel"** | Colisão com marca registrada de moda; grafia ambígua PT/EN | Decidir por "Instant Channel" **antes da Fase A**; registrar domínio junto com o do ERP. Prefixo `ichl_` serve às duas grafias |
| 2 | **10 ms de CPU no Workers free** | Turnos de IA, ffmpeg e embeddings não cabem no request | Resolvido por desenho (2.2): tudo pesado no worker; webhooks apenas validam e enfileiram |
| 3 | **Worker OCI é ponto único** | Sockets Baileys + `ia-turno` + SSE + crons na mesma VM gratuita | Auth-state no Postgres torna a VM descartável (recriação em < 1 h); watchdog e heartbeat portados; plano B (Railway/Northflank) já documentado no doc 04 §6. Se `ia-turno` competir com os sockets, separar em dois processos na mesma VM antes de pagar infra |
| 4 | **Neon free 0,5 GB + pgvector** | Conversas e chunks com embedding (768 floats ≈ 3 KB/chunk; 10 mil chunks ≈ 30 MB — cabe; HNSW consome RAM do compute) | Arquivamento de conversas > 90 dias no R2 já planejado; teto de documentos e chunks por plano; monitorar CU-h. Degrau pago só com receita |
| 5 | **Políticas da Meta** | App review (`instagram_manage_messages`, `pages_messaging`), verificação de negócio **por tenant**, modelo Tech Provider vs. BSP | Registrar o app e pedir review cedo (lead time); onboarding guiado com checklist. Enquanto pende, o tenant opera por Baileys (só respondendo) |
| 6 | **Ban do Baileys** | Risco permanente de canal não oficial | Regra 12 estrutural (conector sem método proativo); **fixar a versão exata do Baileys 7** e re-testar `@lid`, nono dígito e decodificação a cada bump (doc 08 §6) |
| 7 | **PBKDF2 em vez de argon2id** | Divergência nº 4 do doc 11 (teto do runtime CF) | Mantida; o formato versionado do hash já prevê re-hash transparente quando houver runtime sem teto |
| 8 | **Zod v3 e v4 convivendo** | Dois dialetos no mesmo monorepo | Regra clara (3.1-D): código novo em `zod/v4` via subpath. Migração total como dívida com gatilho |
| 9 | **Instant ERP na Onda 0** | Integração "nativa" contra produto que ainda nasce | Contrato versionado + sandbox de fixtures (7.3); Asaas cobre pagamento nesse meio-tempo. **Nenhuma fase bloqueia esperando o ERP** |
| 10 | **LGPD × IA por tenant** | Dados de clientes finais indo a provedores de IA; documentos de conhecimento podem conter dados pessoais | DPA cobre operadores de IA (art. 33); PII-gate por tenant no pipeline **e na ingestão**; exportação e anonimização de titular alcançam `ChunkConhecimento` |
| 11 | **Custo de IA da plataforma** | Tenants no fallback de chave da plataforma podem estourar custo | `UsoIA` + teto por plano fail-closed (turno recusa com mensagem de limite → `fila_humano`); excedente cobrado conforme doc 06 |
| 12 | **Verificação Meta atrasa onboarding** | WhatsApp oficial exige negócio verificado | Vira funil comercial (doc 05 §7.4): Baileys no plano de entrada, oficial no Pro — argumento de venda, não bloqueio |

---

## 12. Sequência de execução

1. **Documentação** (esta entrega): este doc + notas no `CLAUDE.md` e no doc 04.
2. **Fase A** — design system e rebrand: 2–3 sessões.
3. **Fase B** — inbox e robustez do worker: 3–4 sessões.
4. **Fase C** — motor de IA: 3–4 sessões.
5. **Fases D–I** conforme a tabela da seção 10, cada uma revisada antes de começar.

Cada fase abre com leitura do `AGENTS.md` dos módulos que toca e fecha atualizando-o no mesmo PR, com entrada no `CHANGELOG` e handoff da sessão.
