# 11 — Adaptações de implementação (registro de decisões pós-planejamento)

**Sumário executivo.** Os docs 01–10 são a fonte de verdade do *desenho*. Este documento registra onde a **implementação real divergiu** do desenho — sempre por restrição de ambiente descoberta em produção, nunca por preferência — com o porquê, o custo aceito e o gatilho de reversão. Regra da casa: toda divergência nova entra AQUI no mesmo PR que a introduz.

| # | Área | O desenho dizia | O que está implementado | Por quê | Gatilho p/ voltar ao desenho |
|---|---|---|---|---|---|
| 1 | Deploy do painel | CI GitHub Actions: teste → deploy Wrangler (doc 04 §2.1, doc 09 §6) | **Cloudflare Workers Builds** (Git integration) builda e deploya a cada push na `main`; workflow do Actions **desativado** (`gh workflow disable ci`) | Conta GitHub billing-locked; dono optou por não pagar Actions agora. Portão de qualidade: typecheck+testes podem entrar no build command do Workers Builds; E2E de tenant rodam manualmente contra o Neon antes de mudança de schema/tenancy | Regularizar billing → `gh workflow enable ci` (o `ci.yml` está pronto) |
| 2 | Prisma no Worker | Adapter `pg` com engine padrão (doc 03) | Adapter `pg` mantido, mas **`engineType = "client"`** (query compiler WASM, sem engine Rust) + patch pós-generate reordenando condições `workerd` (`packages/db/scripts/patch-prisma-workerd.mjs`) + `outputFileTracingIncludes` no next.config | Engine nativo tenta `fs.readdir` no workerd e quebra; o esbuild do OpenNext resolvia a condição `node` antes de `workerd` | Nenhum — é o modo recomendado p/ Workers; Node (testes/worker) usa o mesmo client |
| 3 | Pool de conexões | Pool `pg` global reutilizado | **`maxUses: 1`** no `PrismaPg` quando `navigator.userAgent === "Cloudflare-Workers"` (`packages/db/src/unsafe.ts`) | Workers proíbe reusar socket TCP entre requests ("Worker's code had hung") | Nenhum em Workers; em Node o pool reusa normalmente |
| 4 | Hash de senha | argon2id via hash-wasm (doc 08 §3.7) | **PBKDF2-SHA256 via WebCrypto** (100k iterações — teto do runtime CF), hash com formato versionado `$pbkdf2-sha256$i=...` | Workers proíbe `WebAssembly.compile()` dinâmico em produção; argon2id (19 MiB) estouraria o CPU do plano gratuito | Runtime sem teto (worker Node/plano pago) → migrar p/ argon2id com re-hash transparente no login (o formato versionado já prevê) |
| 5 | Booking pública | `{slug}.atende-ai.com.br` por hostname via KV (doc 02 §3, doc 04 §2.3) | **Path** `/agendar/{slug}` no domínio workers.dev | Domínio próprio ainda não registrado | Registrar domínio → custom domain no Worker + resolução por hostname ({slug} do Host header); `resolverEmpresaPorSlug` já serve os dois |
| 6 | GCal pull | Cron pg-boss no worker OCI (doc 02 §3.1) | **Cron Trigger do próprio Worker web** (`worker.ts` scheduled → rota interna `/api/cron/gcal-pull` com `CRON_SECRET`), a cada 10 min; sync free/busy 30 dias → bloqueios `origemGcal` replace-all | `apps/worker`/VM OCI só se torna necessário no Bloco 3 (Baileys/SSE); Cron Trigger cobre o caso a custo zero e sem infra nova | Bloco 3 provisiona o worker → avaliar mover o cron p/ pg-boss junto dos demais jobs (não obrigatório) |
| 7 | Escopo Google | — (doc não especificava escopo) | `calendar.freebusy` (mínimo: só janelas ocupado/livre, nunca conteúdo de evento) | Minimização LGPD | Sync bidirecional (Fase 2, Bloco 13) exigirá `calendar.events` — pedir upgrade de escopo na reconexão |
| 8 | Sync incremental GCal | `syncTokenGcal` incremental (doc 02 §3) | **free/busy stateless** (janela de 30 dias, replace-all idempotente); campo `syncTokenGcal` permanece no schema | free/busy é ~10× menos código, sem estado p/ corromper (410 GONE etc.); volume do MVP (poucas conexões × 1 chamada/10 min) é desprezível | Se o rate limit do Google apertar (muitos profissionais) → migrar p/ `events.list` incremental usando o campo já existente |
| 9 | Origem do design system | Portar o do ev-tracker (Tailwind 4 + 15 primitivos próprios), doc 12 §3.2 | **Cópia adaptada do chassi do Mensvra ERP** (`@mensvra-erp/ui` → `packages/ui`) + os tokens de marca do ERP (`globals.css`), com o vocabulário de ícones de atendimento acrescentado | O ERP já tinha a identidade da família Mensvra pronta e medida (navy / azul elétrico / roxo em oklch, com contrastes AA anotados linha a linha). Portar do ev-tracker significaria inventar uma paleta e deixar os dois produtos da família visualmente desconexos. Decisão do dono do produto | Nenhum previsto. Se o Channel divergir visualmente do ERP a ponto de a paleta atrapalhar, os tokens são um arquivo só (`apps/web/src/app/globals.css`) |
| 10 | Escopo da cópia do chassi | "Copiar `@mensvra-erp/ui` inteiro" | **Chassi + base + componentes + formato + status.** Ficaram de fora: `escopo/` (por segurança), `telas/`, `tabela/`, `consulta/`, `referencia/`, `Trilha` (dependem de `escopo/`), `formulario/` (arrasta `@mensvra-erp/contracts`, domínio fiscal) e `graficos/` (sem métrica para desenhar ainda) | `escopo/` é o **seletor de empresa/filial na interface** do ERP: no Channel o tenant vem sempre da sessão JWT e nunca de escolha na tela (**regra inviolável 3**), e não existe versão "só visual" disso que seja segura. O resto ou depende dele ou é anatomia de grid de ERP, que não é a forma de uma inbox | `formulario/` volta sem os campos fiscais quando o estúdio de agentes precisar; `graficos/` entra na Fase D. `escopo/` **não volta** |
| 11 | Nome do produto | — | **Mensvra Channel** (grafia inglesa) no painel, na marca e nos textos. Prefixo técnico de chave de API: `ichl_` | "Chanel" colide com marca registrada de moda (SEO ruim, risco de marca). Decisão do dono do produto, tomada antes da Fase A justamente porque é ela que renomeia o painel | Nenhum. Os nomes técnicos de package (`@atende/*`) seguem inalterados por ora — ver nota abaixo |

| 12 | Tempo real da inbox | SSE do hub no worker (doc 01, doc 12 §2.3) | **Polling condicional por assinatura** (`apps/web/src/modules/inbox/pulso.ts`): o tick pergunta `max(atualizadoEm) + count` das conversas do tenant e só chama `router.refresh()` quando a assinatura muda; pausa com a aba escondida e não empilha requisições | O hub SSE vive no `apps/worker`, que ainda roda local e **não tem host público** (mesma raiz da divergência 6). Servir o stream pelo próprio Next não resolve: o Worker teria de consultar o banco dentro da conexão aberta, contra o teto de 10 ms de CPU do plano gratuito | Worker na nuvem com host público → hub SSE, mantendo este polling como fallback (proxy corporativo derruba SSE, e a inbox não pode parar) |

## Nota — bug do inbound corrigido na Fase B (vale como aviso permanente)

O `remoteJid` de uma mensagem de **status/story** vem como `status@broadcast`, mas o `remoteJidAlt` da mesma chave traz **um telefone válido**:

```json
{ "remoteJid": "status@broadcast", "remoteJidAlt": "5511911128569@s.whatsapp.net",
  "participant": "276927176822971@lid", "addressingMode": "lid" }
```

A versão anterior de `identidadeDeMensagem` procurava o telefone **antes** de checar o endereço da conversa: encontrava um em `remoteJidAlt` e admitia a mensagem. O filtro de `status@broadcast` existia, mas vinha depois e nunca era alcançado — **cada story postado por qualquer contato da agenda viraria uma conversa nova na inbox**, com nome e telefone de gente real.

A regra que ficou: **o endereço da conversa decide a admissão antes de qualquer busca por remetente** (`conversaDireta` recusa `status@broadcast`, `@g.us`, `@newsletter` e `@broadcast`). Presa por `packages/canais/src/baileys/conector.test.ts`, com payloads reais do `diag-inbound.log`.

## Nota — os packages ainda se chamam `@atende/*`

O produto é Mensvra Channel; os packages continuam `@atende/core`, `@atende/db`, `@atende/ui`. **É dívida consciente, não esquecimento.** Renomear o escopo toca todo import do monorepo, os `paths` do tsconfig, o `transpilePackages` e o nome do repositório — churn grande, risco real de quebrar o deploy, e ganho zero para quem usa o produto (o nome do package não aparece em lugar nenhum da tela).

**Gatilho para renomear:** quando o repositório e o domínio forem renomeados, tudo na mesma leva. Até lá, o nome visível ao usuário (título, marca, metadados) é o único que precisa estar certo — e está.

## Notas de resolução de módulos (Bloco 3)

- **Um único regime de resolução no monorepo: `bundler`** (tsconfig.base). O `apps/web` consome `@atende/core`/`@atende/db` como **TS cru** via `transpilePackages`, e o webpack do Next **não** faz o rewrite `.js`→`.ts`. Se um package usar imports com extensão `.js` (exigência do `nodenext`), o build do web quebra com `Module not found: ./x.js`. Portanto: **nenhum package usa `.js` nos imports relativos** e o `apps/worker` **não** usa `nodenext` — herda `bundler` e roda via `tsx` (esbuild resolve extensionless). Um `.js` reintroduzido num package derruba o deploy inteiro (o Workers Builds falha silenciosamente e as rotas novas ficam 404).
- **Caveat do build de produção do worker**: `pnpm --filter @atende/worker build` (`tsc` emit) com resolução `bundler` **não** injeta `.js` no output — `node dist/index.js` sob ESM do Node falharia. Hoje o worker roda **local via `tsx`** (não usa o output), então não afeta nada. Quando for para a nuvem (Oracle/Docker), trocar o build por `tsup`/`esbuild` (bundle único) em vez de `tsc` emit.

## Notas de operação (Bloco 2)

- **Janela de eco do GCal**: até 10 minutos (cron `*/10 * * * *`). Documentada na UI da aba Profissionais.
- **Secrets do Worker** (produção): `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Var pública: `APP_BASE_URL`.
- **Redirect URI Google**: `{APP_BASE_URL}/api/gcal/callback` — atualizar no Google Cloud Console quando o domínio próprio entrar.
- **Cron local**: `wrangler dev --test-scheduled` + `GET /cdn-cgi/handler/scheduled?cron=*/10+*+*+*+*`.

## Divergência 13 — a agenda sai da superfície por variável de ambiente, não por coluna

**O desenho dizia:** sinalizador **por empresa**, desligado por padrão (plano de estágios, E0).

**O que está implementado:** `AGENDA_HABILITADA` nas vars do Worker (`src/lib/flags.ts`), desligada por padrão. Fecha o grupo do menu, as cinco rotas de `(painel)/agenda/*` — portão no layout, para que página nova nasça fechada — e a booking pública `/agendar/{slug}`, que é a face externa e sobrevive a qualquer mudança de menu.

**Por quê:** o sinalizador por empresa existe para diferenciar tenants, e hoje o conjunto de tenants que precisaria da agenda ligada está vazio: não há cliente pagante em nenhum produto, e o perfil decidido é distribuidor com entrega. Criar a coluna agora custaria migration aplicada à mão contra o Neon (o build do Workers Builds não roda `migrate deploy`) com deploy coordenado, para separar um conjunto vazio.

**Gatilho para voltar ao desenho:** o primeiro tenant que precise da agenda ligada. Aí vira `Empresa.agendaHabilitada` e a função passa a ler a sessão — troca barata porque o resto do código só conhece a função.

## Divergência 14 — o cadastro fecha até existir cobrança

**O desenho dizia:** onboarding self-service, com trial de 14 dias sem cartão (doc 06).

**O que está implementado:** `CADASTRO_ABERTO`, desligada por padrão. A action `cadastrarAction` recusa antes de qualquer validação — o portão é no servidor, porque esconder o formulário e deixar a action aberta é convite a quem sabe montar um POST. A página `/cadastro` explica em vez de dar 404 (o link circula em proposta e e-mail), e login e home trocam "Criar conta" por "Pedir acesso". Conta nova nasce por `/convite/{token}`, que já existia.

**Por quê:** não existe cobrança em produto nenhum — sem `PlanoLicenca`, sem assinatura, sem limite por plano, sem porta de pagamento. Cadastro aberto nesse estado é uma máquina ligada atraindo de graça justamente o público que o perfil de cliente manda recusar: o próprio formulário pede a vertical, e as opções são salão, barbearia, clínica e advocacia.

**Gatilho para voltar ao desenho:** a cobrança existir (E1 do plano de estágios). Autoatendimento com porta de pagamento é aquisição; sem ela é custo.

## Decisões do ecossistema que mudam este produto (2026-08-17)

Estas não são divergências de implementação: são decisões tomadas no nível da empresa, registradas em `instant-empresa/adr/`, que alteram o **desenho** deste produto. Ficam aqui porque quem lê os docs 01–12 precisa saber o que deixou de valer.

| Decisão | O que muda no Mensvra Channel | Onde está registrada |
|---|---|---|
| **Perfil de cliente do ecossistema** | O produto deixa de ser horizontal. O comprador passa a ser o **diretor comercial de distribuidora com entrega (R$ 50–150 M)**, e clínica, escola, advocacia e farmácia entram no descarte imediato — justamente o público para o qual o doc 06 precificou e o doc 02 §12 criou papéis padrão. Consequências: preço refeito, discurso refeito, e os requisitos de operação de atendimento (filas, prazo de primeira resposta com escalonamento, distribuição por carteira do vendedor, etiquetas obrigatórias) sobem para o MVP porque o comprador novo os exige | `adr/0001-beachhead-e-icp.md` |
| **Preço** | Basic R$ 149 / Pro R$ 349 / Premium R$ 749 ficam **inteiramente abaixo do piso** da faixa de entrada do ecossistema (R$ 400/mês) e são descartados junto com o público antigo. A tabela nova está em `instant-empresa/04-precificacao/`. Como não existe cliente pagante — não há modelo de plano, assinatura, período de teste nem porta de pagamento no código —, não há grandfathering a proteger | `instant-empresa/04-precificacao/` |
| **Canal oficial é o canal de produto** | O Baileys deixa de ser o canal do plano de entrada e o "funil comercial" descrito no doc 12 §11 não vale mais. Uso restrito: piloto, sem SLA em contrato, com o risco descrito por escrito. Consequência de sequência: o **app review da Meta é protocolado no Estágio E0**, antes de qualquer funcionalidade nova, porque é espera e não trabalho | `adr/0003-canal-oficial-como-padrao.md` |
| **Ordem dos conectores** | `totvs` se desdobra em `totvs_winthor` e `totvs_protheus` (`packages/integracoes/src/tipos.ts`), com meios de integração diferentes. **Winthor sobe para prioridade máxima** — leitura de estoque, preço e crédito no E2; escrita de pedido no E3 — e a Sankhya desce, porque é concorrente direto e a integração com ela é argumento de coexistência, não conquista de base | `adr/0006-conector-totvs-desdobrado.md` |
| **Fronteira entre produtos** | A regra do doc 12 §1.3 (bancos independentes, integração por contrato de API) **continua valendo e foi ratificada**. O que muda é o que falta construir para a promessa comercial ser verdadeira: identidade única entre os produtos, cadastro mestre com mapa de correspondência (o `MapeamentoEntidade` já implementado é a semente) e núcleo de venda exposto como serviço | `adr/0002-fronteira-entre-produtos.md` |
| **O núcleo compartilhado sai dos produtos** | Seis contextos que hoje vivem aqui passam a viver numa **plataforma própria**, consumidos por API interna e por evento: identidade e acesso, tenancy e assinatura, cadastros mestres, motor fiscal, agentes de IA, e integração e conectores — mais barramento de eventos e observabilidade. A regra do doc 12 §1.3 continua intacta (nunca acesso cruzado a banco, nunca dependência de código): a plataforma é dependência de **runtime por API**, não de código, e não é pré-requisito de valor — o cliente contrata um produto isolado e ela está atrás, invisível. O motivo é o custo de duplicação que já está sendo pago: duas autenticações, dois modelos de permissão, dois desenhos de conector, e uma medição de consumo que precisa ser única porque é a fonte da fatura | `adr/0008-nucleo-compartilhado.md` |
| **Régua de fases** | As Fases A–I deste documento e do doc 12 continuam legíveis, mas a régua da empresa passa a ser **Estágios E0–E8**. Os rótulos "Fase 0", "Fase 1.5", "Fase 2" e "ciclo 2" usados em commits recentes — que nunca existiram em documento nenhum — são descontinuados. Tradução: Fase A concluída · Fase B em E1 · Fase C majoritariamente feita, resto em E1 · Fase D com agentes feitos e conhecimento em E2 · Fase E em E2 · Fase F em E3 · Fase G com fundação feita e conectores em E2–E3 · Fase H em E3–E4 · Fase I em E2 (webchat) e E8 | `adr/0007-regua-unica-de-estagios.md` |
| **Medição de consumo de IA volta ao escopo** | A divergência registrada em comentário de schema — a chave de IA mora em `IntegracaoExterna` e por isso `ConfigIAEmpresa`/`UsoIA` ficaram de fora — deixa de ser aceitável: sem medição por tenant, com teto por plano e degradação, não existe plano cobrável nem o requisito não funcional de custo. Entra no **Estágio E1**, junto dos modelos de plano e assinatura | `instant-empresa/09-plano/estagios.md`, E1 |

**O que não muda:** as três regras invioláveis de tenancy, o congelamento do módulo de agenda (que agora também sai da superfície do produto por sinalizador, porque o menu de agendamento confunde um distribuidor), as guardas do motor de IA, e o contrato v1 com o Mensvra ERP.
