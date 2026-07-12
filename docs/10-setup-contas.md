# Setup de contas — passo a passo

**Sumário executivo.** Este documento é o **checklist operacional** de todas as contas de serviço externas que o atende-ai depende, ordenadas por **quando você precisa de cada uma**: as três primeiras (Neon, Cloudflare, domínio) desbloqueiam o próximo commit funcional; as demais só entram quando o bloco correspondente do roadmap (doc 04) começa. Para cada serviço: link direto, passo a passo, se pede cartão, limites do free tier, o que copiar e **onde configurar** no repo (variável de ambiente, arquivo, ou GitHub Secret). Regras da casa: **um único e-mail** para todas as contas de serviço (recomendado: um alias/e-mail dedicado, ex. `atendeai@seudominio.com`); **1Password/Bitwarden** para guardar credenciais — nunca em `.txt` na área de trabalho; **cartão** só onde a coluna "Cartão?" dizer "Sim (verificação)" ou "Sim (uso)".

---

## Ordem recomendada

| Fase | Serviços | Quando |
|---|---|---|
| **A — Agora** | Neon Postgres · Cloudflare · Domínio (opcional agora) | Desbloqueia a 1ª migration e o deploy do painel |
| **B — Bloco 2** | Google Cloud (OAuth) | Booking pública + Google Calendar pull |
| **C — Bloco 3** | Oracle Cloud · Meta Business · WhatsApp Cloud API | Canal WhatsApp oficial + worker Baileys |
| **D — Bloco 4** | Anthropic Console · Google AI Studio · Brevo | IA (Claude + Gemini) + e-mail transacional |
| **E — Bloco 5** | Asaas | Gateway de pagamento |
| **F — Ops (a qualquer momento)** | Sentry · BetterStack · GitHub Secrets do deploy | Monitoramento e CI/CD |

---

## Fase A — desbloqueia o próximo commit funcional

### 1. Neon Postgres — banco (DATABASE_URL)

- **URL:** https://console.neon.tech
- **Cartão?** Não (free tier permanente).
- **Free tier:** 0,5 GB de armazenamento · 100 compute-hours/mês · 10 branches por projeto. Suficiente para MVP com dezenas de tenants pequenos.
- **Migrar quando:** passar de 0,5 GB ou 100 CU-h/mês. Próximo degrau: plano **Launch US$ 19/mês** (10 GB, sem limite de CU-h).

**Passos:**
1. Acesse https://console.neon.tech e faça login com GitHub (recomendado — evita mais uma senha).
2. **Create project**:
   - Name: `atende-ai`
   - Postgres version: **17**
   - Region: **AWS · São Paulo (sa-east-1)** — menor latência para o Cloudflare Workers deployado no BR.
   - Compute size: mínimo (0.25 CU) — sobe automático depois se precisar.
3. Na tela seguinte, copie a **Connection string** — vem no formato:
   ```
   postgresql://<user>:<password>@ep-xxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require
   ```
   **Use a versão com `-pooler`** no host (é o pgbouncer do Neon; é o que o adapter `pg` do Prisma espera — doc 03).
4. Salve como `DATABASE_URL` no `.env` local do `packages/db`:
   ```bash
   # C:\Users\raydo\atende-ai\packages\db\.env
   DATABASE_URL="postgresql://...pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require"
   ```
5. Rode a 1ª migration:
   ```bash
   cd C:\Users\raydo\atende-ai
   pnpm --filter @atende/db exec prisma migrate dev --name inicial
   ```
   Isso cria as tabelas do domínio `identidade` (Bloco 0/1) no Neon e commita a migration em `packages/db/prisma/migrations/`.

**O que copiar:**
- `DATABASE_URL` (pooler) — vai para `.env` local **e** para os GitHub Secrets (Fase F) para o deploy.

---

### 2. Cloudflare — deploy do painel e API (apps/web)

- **URL:** https://dash.cloudflare.com/sign-up
- **Cartão?** Não no Workers Free (uso comercial permitido). Só pede cartão quando você adiciona domínio pago para registrar via Cloudflare ou faz upgrade do Workers.
- **Free tier:** **100.000 requests/dia** nos Workers · **10 GB no R2** (storage de mídia) egress zero · **KV** com 100k reads/dia + 1k writes/dia · **Pages** ilimitado.
- **Migrar quando:** passar de 100k req/dia (ordem de ~5.000 conversas ativas/dia). Próximo degrau: **Workers Paid US$ 5/mês** (10M req/mês inclusas + US$ 0,30/M adicional).

**Passos:**
1. Cadastre-se em https://dash.cloudflare.com/sign-up com o mesmo e-mail do Neon.
2. Confirme o e-mail. Dashboard abre.
3. **Workers & Pages** → **Overview** → clique em **Create application** → **Create Worker** só para reservar um subdomínio `workers.dev`. Nome sugerido: `atende-ai-web`. Pode deletar o "Hello World" gerado — você vai fazer o deploy real via Wrangler + OpenNext do repo, não pelo dashboard.
4. **Workers & Pages** → **KV** → **Create namespace**:
   - Namespace: `atende-ai-config` (guarda config resolvida de tenant por slug — doc 09).
5. **R2** → **Create bucket**:
   - Bucket: `atende-ai-midia` — storage de mídia inbound (WhatsApp, imagens de comprovantes, PDFs de contratos).
6. **My Profile** → **API Tokens** → **Create Token** → template **Edit Cloudflare Workers**. Copie o token — vai virar `CLOUDFLARE_API_TOKEN` no GitHub Secrets (Fase F).
7. Anote também o **Account ID** (canto direito do dashboard) — vira `CLOUDFLARE_ACCOUNT_ID`.

**O que copiar:**
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- ID do KV namespace `atende-ai-config` (vai para `wrangler.jsonc` do `apps/web` quando o adapter OpenNext for configurado — fim do Bloco 0).
- Nome do bucket R2 `atende-ai-midia`.

---

### 3. Domínio — `atende-ai.com.br` (ou o que você escolher)

- **Onde:** https://registro.br (domínios `.com.br`).
- **Cartão?** Sim, para pagar (**R$ 40/ano** — este é o único custo praticamente inevitável do dia 1, doc 07).
- **Precisa agora?** **Não é bloqueante para desenvolver.** No Bloco 0/1 você usa o subdomínio grátis do Workers (`atende-ai-web.workers.dev`). Registrar antes economiza tempo depois e evita que o nome vá pra outro, mas dá pra adiar até o beta.

**Passos (quando registrar):**
1. Crie conta no https://registro.br (pede CPF/CNPJ).
2. Busque `atende-ai.com.br` (ou variação). Se livre, adicione ao carrinho e pague (Pix).
3. Depois de registrado, aponte para o Cloudflare:
   - No painel do Cloudflare: **Websites** → **Add a site** → informe o domínio.
   - Cloudflare vai gerar 2 nameservers (algo tipo `xxx.ns.cloudflare.com`).
   - Volte no registro.br → **Meus Domínios** → o domínio → **Alterar servidores DNS** → cole os 2 nameservers do Cloudflare. Propagação leva de minutos até algumas horas.
4. No Cloudflare, crie os records:
   - `A` ou `CNAME` `app.atende-ai.com.br` → aponta para o worker.
   - `*` (wildcard) `*.atende-ai.com.br` → mesmo worker (para as booking pages `{slug}.atende-ai.com.br`).
   - `A`/`CNAME` `atende-ai.com.br` (raiz) → landing.

**Alternativa mais barata para começar:** `.com` no Cloudflare Registrar (~US$ 10/ano no atacado — sem markup) ou Porkbun. Mas `.com.br` transmite mais confiança para o público-alvo BR.

---

## Fase B — Bloco 2 (agenda + booking + Google Calendar)

### 4. Google Cloud — OAuth para Google Calendar

- **URL:** https://console.cloud.google.com
- **Cartão?** Não para OAuth (Calendar API é grátis; só cobra em Cloud Run/BigQuery, que não usamos).
- **Free tier:** Calendar API tem quotas generosas (1M requests/dia por padrão, aumentável).

**Passos:**
1. Login no https://console.cloud.google.com com o mesmo e-mail.
2. **New Project**: name `atende-ai`.
3. **APIs & Services** → **Library** → busque **Google Calendar API** → **Enable**.
4. **APIs & Services** → **OAuth consent screen**:
   - User type: **External**
   - App name: `atende-ai`
   - Support email: seu e-mail
   - Scopes: adicione `.../auth/calendar` (leitura+escrita de calendário)
   - Test users: adicione seu próprio e-mail (até publicar o app fica em "Testing")
5. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**:
   - Type: **Web application**
   - Name: `atende-ai-web`
   - Authorized redirect URIs (adicione os três):
     - `http://localhost:3000/api/google/callback` (dev)
     - `https://app.atende-ai.com.br/api/google/callback` (prod)
     - `https://atende-ai-web.workers.dev/api/google/callback` (Cloudflare temp)
6. Copie **Client ID** e **Client Secret**.

**O que copiar:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

---

## Fase C — Bloco 3 (canais WhatsApp)

### 5. Oracle Cloud — VM Ampere A1 para o `apps/worker`

- **URL:** https://www.oracle.com/cloud/free/
- **Cartão?** **Sim — só para verificação** (a Oracle cobra US$ 0,00; é a única exceção à regra "sem cartão" — doc 01/07).
- **Free tier:** **Always Free**: até 4 vCPUs ARM + 24 GB RAM (Ampere A1), 200 GB block storage, tráfego generoso, load balancer. **Nunca expira** enquanto a conta estiver ativa.
- **Migrar quando:** se decolar (>50 tenants em sockets Baileys) — mas antes do teto do Always Free, considere um segundo região (também Always Free).

**Passos:**
1. Cadastre em https://www.oracle.com/cloud/free/ — mesmo e-mail.
2. **Home Region:** escolha uma região com **VM ARM disponível** — as mais estáveis para BR são **`sa-saopaulo-1`** (São Paulo, latência baixa) ou **`us-ashburn-1`** se São Paulo esgotar capacidade ARM. A região é **imutável** depois de escolhida.
3. Cadastro pede: identidade + telefone (SMS) + cartão de crédito (para verificação, com débito de US$ 1 estornado).
4. **Compute** → **Instances** → **Create instance**:
   - Name: `atende-worker`
   - Shape: **Change shape** → **Ampere** → `VM.Standard.A1.Flex` → **2 OCPUs, 12 GB RAM** (metade do Always Free — sobra para escalar sem sair do grátis)
   - Image: **Canonical Ubuntu 24.04**
   - Networking: cria VCN nova (default), atribua public IP.
   - SSH: baixe o par de chaves (`.pem`) — guarde no Bitwarden.
5. Depois que a VM subir:
   - SSH via `ssh -i chave.pem ubuntu@<IP público>`
   - Instale Docker: `curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker ubuntu`
   - Instale docker-compose plugin.
   - Configure firewall: **Networking** → VCN → Security Lists → abra a porta **443** (HTTPS do healthcheck e SSE) — e **bloqueie a 22 do mundo**, permitindo só do seu IP.
6. Vai receber DNS público tipo `xxx.compute.oraclecloud.com` — anote como `WORKER_HOST`.

**O que copiar:**
- IP público / DNS da VM → `WORKER_HOST`
- Chave SSH `.pem` (guardar segura!) → vai para `SSH_PRIVATE_KEY` no GitHub Secrets se automatizar o deploy.

**Plano B se OCI recusar cartão (raro mas acontece):** Northflank Free (US$ 0 permanente, 1 vCPU + 1 GB RAM) — capacidade menor mas suficiente para começar.

---

### 6. Meta Business + WhatsApp Cloud API

- **URL:** https://business.facebook.com
- **Cartão?** **Não** para começar (sandbox e conversas de teste são grátis). **Sim** quando for para produção real — Meta cobra por conversa iniciada por template (US$ 0,008/msg utility no BR).
- **Free tier:** 1.000 conversas de serviço/mês grátis + testes ilimitados no número de teste.

**Passos (leva alguns dias por causa da verificação Meta):**
1. Crie uma **Página do Facebook** para o atende-ai (se ainda não tiver) — o Meta exige.
2. Acesse https://business.facebook.com → **Create Account** (Meta Business Suite).
3. **Business Settings** → **Accounts** → **WhatsApp Accounts** → **Add**.
4. Cadastre a WhatsApp Business Account (WABA) — leva o número de teste da Meta.
5. **Business Settings** → **System Users** → **Add** — crie um system user "atende-ai-worker" com role **Admin**.
6. Gere um **System User Access Token** com escopos `whatsapp_business_messaging` e `whatsapp_business_management` — token **permanente** (não expira). É este que vai virar `META_ACCESS_TOKEN`.
7. Anote:
   - `META_APP_ID` (App do Meta Developers)
   - `META_APP_SECRET` (dashboard do App)
   - `META_ACCESS_TOKEN` (system user, permanente)
   - `META_PHONE_NUMBER_ID` (do número de teste inicialmente; substitui pelo real depois)
   - `META_WABA_ID` (WhatsApp Business Account ID)
   - `META_VERIFY_TOKEN` — string aleatória **que você mesmo inventa** (ex. `atende_verify_$(openssl rand -hex 16)`); usada na verificação de webhook.
8. Configure webhook em **App Dashboard** → **WhatsApp** → **Configuration**:
   - Callback URL: `https://app.atende-ai.com.br/api/webhooks/meta` (depois do domínio + deploy)
   - Verify Token: o que você inventou acima
   - Subscribe fields: `messages`, `message_status`.
9. Para produção: **Facebook Business Verification** (envia CNPJ, comprovante de endereço, etc — leva 3-10 dias úteis). Só depois libera envio proativo em escala.

**O que copiar:** os 6 valores listados no passo 7 acima.

---

## Fase D — Bloco 4 (IA + e-mail)

### 7. Anthropic Console — Claude (produção)

- **URL:** https://console.anthropic.com
- **Cartão?** **Sim (uso)** — não tem free tier permanente relevante; começa pré-pago (adiciona crédito, ex. US$ 5).
- **Custo:** Claude Haiku 4.5 ≈ US$ 1/M input tokens · US$ 5/M output. Para 15% das conversas de IA do atende-ai (escalação a partir do Gemini) → ~R$ 0,05/conversa.

**Passos:**
1. Cadastre em https://console.anthropic.com.
2. **Settings** → **Billing** → adicione método de pagamento (Visa/Master). Comece com **US$ 5 de crédito** e configure **usage limit** de US$ 20/mês por segurança até validar consumo.
3. **API Keys** → **Create Key**: name `atende-ai-prod` → copie `ANTHROPIC_API_KEY`. **Só aparece uma vez.**

**O que copiar:** `ANTHROPIC_API_KEY`

---

### 8. Google AI Studio — Gemini (default de produção)

- **URL:** https://aistudio.google.com/app/apikey
- **Cartão?** **Sim (uso)** para o plano pago — **imprescindível para produção**, porque o free tier do Gemini **usa dados para treino** (veto LGPD — CLAUDE.md, decisão registrada no doc 03).
- **Custo:** Gemini 2.5 Flash ≈ US$ 0,075/M input · US$ 0,30/M output. Para 85% das conversas do atende-ai → ~R$ 0,10/conversa.

**Passos:**
1. Login em https://aistudio.google.com com o mesmo e-mail.
2. **Get API key** → **Create API key** → name `atende-ai-prod`.
3. **⚠️ Trocar para plano pago:** por padrão a chave nasce **Free tier** (que usa dados para treino). Vá em **Google Cloud Console** → o projeto `atende-ai` (criado na Fase B) → **Billing** → **Link a billing account** → habilite billing. Depois volte no AI Studio, a chave passa a operar em modo pago automaticamente. Verifique: **Get API key** → a chave deve mostrar **"Paid tier"**.
4. Copie a chave.

**O que copiar:** `GEMINI_API_KEY`

**Free tier em dev:** você **pode** ter uma segunda API key em modo Free só para o ambiente de desenvolvimento (dados que **não** são de tenants reais). Nunca use essa em prod.

---

### 9. Brevo — e-mail transacional (primário)

- **URL:** https://www.brevo.com
- **Cartão?** Não.
- **Free tier:** **300 e-mails/dia grátis permanente**, para sempre. Suficiente para MVP (lembretes por e-mail dos tenants só-Baileys — doc 06 §4).
- **Migrar quando:** passar de 300/dia. Próximo degrau: plano **Starter US$ 9/mês** (20k e-mails/mês).

**Passos:**
1. Cadastre em https://www.brevo.com.
2. Confirme e-mail e telefone (SMS).
3. **Senders, Domains & Dedicated IPs** → **Senders** → adicione o e-mail remetente (ex. `nao-responda@atende-ai.com.br`).
4. **Domains** → **Authenticate**: adicione o domínio `atende-ai.com.br` e siga o wizard para configurar **SPF** e **DKIM** (adiciona records TXT no Cloudflare DNS). Sem isso o Gmail joga tudo em spam.
5. **SMTP & API** → **API Keys** → **Generate** — name `atende-ai`. Copie.

**O que copiar:** `BREVO_API_KEY`

**Fallback (Resend):** cadastre também em https://resend.com (3.000 e-mails/mês grátis, sem cartão) — a cascata do doc 08 §3.5 usa Brevo primário, Resend secundário. `RESEND_API_KEY` sai igual.

---

## Fase E — Bloco 5 (pagamento)

### 10. Asaas — gateway com subcontas white-label

- **URL:** https://www.asaas.com
- **Cartão?** Não (não tem mensalidade).
- **Custo:** por transação (do **cliente final do tenant**, não seu): Pix R$ 1,99 fixo · Boleto R$ 1,99 fixo · Cartão 3,49% + R$ 0,49. **A plataforma atende-ai não paga nada** — o custo fica com o tenant. O **split** de ~1% que você cobra em cima é receita adicional (doc 06 §5).

**Passos:**
1. Cadastre em https://www.asaas.com como **Conta Empresarial** (PJ). Enviar CNPJ + comprovante de endereço.
2. Verificação leva 1-3 dias úteis (KYC).
3. Depois de aprovado, **Ambiente Sandbox**: https://sandbox.asaas.com — cadastre uma conta separada para testes (não expira, ilimitada).
4. Sandbox: **Integrações** → **API** → gere `ASAAS_ACCESS_TOKEN` (sandbox).
5. Produção: mesma coisa em https://www.asaas.com/config/api.
6. Para as **subcontas white-label** (o modelo do doc 06 §5 — o dinheiro do cliente do tenant cai direto na subconta do tenant, não passa pela sua PJ), você usa o endpoint `/v3/accounts` com o token da conta-mãe (a sua). O escopo `Split` precisa ser habilitado no seu contrato — solicite ao gerente Asaas quando ativar o Bloco 5.
7. **Webhook** de baixa: **Integrações** → **Webhooks** → URL `https://app.atende-ai.com.br/api/webhooks/asaas`, evento `PAYMENT_RECEIVED` (e `PAYMENT_CONFIRMED` para cartão). Copie o **token de autenticação do webhook** — é `ASAAS_WEBHOOK_TOKEN`.

**O que copiar:**
- `ASAAS_ACCESS_TOKEN_SANDBOX`
- `ASAAS_ACCESS_TOKEN_PROD`
- `ASAAS_WEBHOOK_TOKEN`

---

## Fase F — Ops (a qualquer momento)

### 11. Sentry — monitoramento de erros

- **URL:** https://sentry.io
- **Cartão?** Não.
- **Free tier:** 5.000 erros/mês · 10.000 performance events. Suficiente para MVP.

**Passos:**
1. Cadastre em https://sentry.io.
2. **Create Project** para cada superfície:
   - `atende-ai-web` (platform: Next.js) — copie `NEXT_PUBLIC_SENTRY_DSN`
   - `atende-ai-worker` (platform: Node.js) — copie `SENTRY_DSN`
3. Instalação vem no Bloco 0.5 (assim que tiver deploy real).

**O que copiar:** os 2 DSNs.

---

### 12. BetterStack — uptime do worker (crítico!)

- **URL:** https://betterstack.com/uptime
- **Cartão?** Não.
- **Free tier:** 10 monitores · check a cada 3 minutos · SMS + Slack + e-mail. Perfeito para o `/healthz` do worker.

**Passos:**
1. Cadastre em https://betterstack.com/uptime.
2. **Create monitor** → URL: `https://<WORKER_HOST>/healthz` (Fase C após OCI subir) — a cada 3 min.
3. Notificações: adicione seu WhatsApp/e-mail. **Worker caído = todos os tenants ficam mudos** (regra herdada do ev-tracker) — este alerta é o mais importante da operação.

---

### 13. GitHub Secrets — segredos do CI/CD

- **URL:** https://github.com/enesioteixeira/agendaai/settings/secrets/actions

**Como configurar:**
1. No repo: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Adicione um por um, à medida que criar cada conta:

| Secret | De onde vem (fase) | Uso |
|---|---|---|
| `DATABASE_URL` | Neon (A.1) | CI e deploys |
| `CLOUDFLARE_API_TOKEN` | Cloudflare (A.2) | Deploy do web via Wrangler |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare (A.2) | Deploy do web via Wrangler |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud (B.4) | OAuth do Calendar |
| `WORKER_HOST` / `SSH_PRIVATE_KEY` | OCI (C.5) | Deploy do worker |
| `META_APP_ID`/`SECRET`/`ACCESS_TOKEN`/`VERIFY_TOKEN`/`PHONE_NUMBER_ID`/`WABA_ID` | Meta (C.6) | WhatsApp oficial |
| `ANTHROPIC_API_KEY` | Anthropic (D.7) | IA (Claude Haiku) |
| `GEMINI_API_KEY` | Google AI (D.8) | IA (Gemini Flash) |
| `BREVO_API_KEY` / `RESEND_API_KEY` | Brevo/Resend (D.9) | E-mail transacional |
| `ASAAS_ACCESS_TOKEN_PROD` / `ASAAS_ACCESS_TOKEN_SANDBOX` / `ASAAS_WEBHOOK_TOKEN` | Asaas (E.10) | Pagamento |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Sentry (F.11) | Monitoramento |
| `SESSION_SECRET` | **gere você mesmo** — `openssl rand -base64 48` | Assinatura JWT (obrigatório em prod) |
| `ENCRYPTION_KEY` | **gere você mesmo** — `openssl rand -base64 32` | AES-256-GCM p/ segredos em repouso |
| `WORKER_SECRET` | **gere você mesmo** — `openssl rand -hex 32` | Autenticação web ↔ worker |

**Não commite nada disso.** O `.gitignore` já bloqueia `.env`, mas confira antes de cada push (`git status`).

---

## `.env.example` local

Depois de criar cada conta, atualize o `.env.example` do repo (que você commita — vazio, só nomes) e o `.env` local (nunca commitado — valores reais). Template inicial:

```bash
# packages/db/.env — Fase A
DATABASE_URL="postgresql://...pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require"

# apps/web/.dev.vars — Fase A/B/C (adicione conforme cadastra)
DATABASE_URL="${DATABASE_URL}"
SESSION_SECRET="troque_por_openssl_rand_base64_48"
ENCRYPTION_KEY="troque_por_openssl_rand_base64_32"
WORKER_SECRET="troque_por_openssl_rand_hex_32"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
META_APP_ID=""
META_APP_SECRET=""
META_ACCESS_TOKEN=""
META_VERIFY_TOKEN=""
META_PHONE_NUMBER_ID=""
META_WABA_ID=""
ANTHROPIC_API_KEY=""
GEMINI_API_KEY=""
BREVO_API_KEY=""
RESEND_API_KEY=""
ASAAS_ACCESS_TOKEN=""
ASAAS_WEBHOOK_TOKEN=""
```

---

## Ordem sugerida para hoje

Se você quer avançar hoje, faça só a **Fase A**:

1. ⏱️ **~5 min** — Cadastro no Neon → criar projeto `atende-ai` em `sa-east-1` → copiar `DATABASE_URL`.
2. ⏱️ **~2 min** — Colar em `packages/db/.env`.
3. ⏱️ **~1 min** — Rodar `pnpm --filter @atende/db exec prisma migrate dev --name inicial` — cria as tabelas no Neon.
4. ⏱️ **~5 min** — Cadastro no Cloudflare → criar KV `atende-ai-config` + R2 `atende-ai-midia` → gerar API Token.
5. ⏱️ **~2 min** — Adicionar `DATABASE_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` como GitHub Secrets.

Isso libera o próximo passo do MVP (Bloco 1 — auth + onboarding). Domínio pode esperar. Fases B/C/D só quando cada bloco chegar.

---

*Documentos relacionados: `docs/03-stack.md` (justificativa técnica de cada serviço), `docs/07-infra-free-tier.md` (limites e gatilhos de migração de cada componente), `docs/08-reuso-ev-tracker.md` (inventário de env vars herdadas).*
