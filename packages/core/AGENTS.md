# AGENTS.md — packages/core

## Propósito

Domínio **puro**: contratos Zod + serviços sem I/O, organizados por bounded context (doc 01 §4). É o coração testável — recebe dados, devolve decisões; quem orquestra I/O são os apps.

## Contratos

Cada domínio segue o trio `schemas.ts` (Zod = contrato de Server Actions, `/api/v1`, webhooks e jobs pg-boss), `services.ts` (lógica pura) e `types.ts` (`z.infer` — tipos derivam dos schemas, nunca o contrário).

## Invariantes

1. **100% puro**: sem Prisma, sem fetch, sem import de qualquer outro package do repo (doc 09 §3.2).
2. Todo tipo público deriva de um schema Zod (`z.infer`).
3. Escopos seguem o formato `modulo:acao` em PT-BR sem acentos (ex.: `contratos:enviar`).
4. Lógica que precisa de banco é assinatura de função pura que **recebe** os dados — o app busca e passa.

## O que NUNCA fazer

- Nunca importar `@atende/db`, `@atende/canais`, `apps/*` ou SDK de provedor.
- Nunca duplicar tipo que um schema já define.
- Nunca colocar lógica de domínio em componente React ou route handler — ela pertence aqui.

## Dependências

Importa: `zod` (só libs). Importado por: `apps/web`, `apps/worker`, `packages/canais`.

## Comandos

```bash
pnpm --filter @atende/core typecheck
pnpm --filter @atende/core test
```

## Nota de dependências

`identidade/senha.ts` usa **PBKDF2-SHA256 via WebCrypto** (`crypto.subtle`, nativo em Workers e Node). A 1ª versão usava argon2id via hash-wasm, mas o Workers proíbe `WebAssembly.compile()` dinâmico em produção e o plano gratuito tem teto de 10 ms de CPU — PBKDF2 nativo é a via documentada pela Cloudflare. Formato do hash é versionado (`$pbkdf2-sha256$i=...`): quando houver runtime sem teto, migra-se p/ argon2id com re-hash no login. `sessao.ts` usa `jose`. Ambos são CPU puro (sem I/O de rede/banco), então cabem no core.

## Estado atual

- [x] `identidade/`: schemas (sessão, cadastro, login, convite), sessão JWT pura (assinar/verificar/guard de escopo), senha argon2id, catálogo de 24 escopos, papéis padrão por vertical (matriz doc 02 §13, testado)
- [x] `crypto/`: AES-256-GCM hard-fail (port do ev-tracker, doc 08 — passthrough banido, testado)
- [x] **Fase C (1ª etapa) — `atendimento/ia/`: o núcleo de decisão do motor**, puro, sem SDK e sem banco:
  - `pii.ts` — portão de PII por tenant em três modos (`off` / `observar` / `mascarar`). CPF, CNPJ e cartão com **validação de dígito verificador**: sem ela a máscara viraria um localizador de "onze dígitos seguidos" e comeria número de pedido e id do ERP. Telefone e e-mail ficam fora de propósito — aqui o telefone **é** a identidade do cliente
  - `tentativa.ts` — orçamento do turno, classificação de erro, escolha de provedor reserva e `PROVEDORES_HOMOLOGADOS`. A lista fica no **código**, não em tabela editável: homologar provedor é decisão de quem responde pelo DPA, e provedor em free tier nunca entra (os termos do nível gratuito costumam autorizar uso do conteúdo para treinamento)
  - `guardas.ts` — três defesas, todas puras:
    - `empacotarResultadoTool` (`<<<dados>>>`, anti-injection, pareado com `MOLDURA_DE_DADOS_NO_SYSTEM` no system prompt);
    - `guardarAfirmacaoDeAcao` (anti-alucinação de AÇÃO: "seu pedido foi confirmado" sem proposta executada vira promessa comercial falsa);
    - `guardarNumeroSemFerramenta` (anti-alucinação de NÚMERO: preço, estoque, crédito, prazo e tributo só saem de chamada de ferramenta). Enquanto o registro de ferramentas estiver vazio a contagem é sempre zero e todo número de decisão é bloqueado — hoje o agente responde cliente real sem nenhuma tool, então qualquer valor que ele dissesse viria da memória do modelo. Os padrões são amarrados ao ASSUNTO e não a "tem dígito": o agente ecoando o cliente ("você falou de 10 caixas?") e horário de atendimento passam; quantidade afirmada como disponível não. Pareado com `ASSUNTOS_QUE_VAO_PARA_HUMANO` no system prompt, que é o que evita o bloqueio acontecer
  - `tipos.ts` — o contrato que os adapters vão cumprir. Existe **antes** deles para que nenhum invente a própria forma
- [ ] **Fase C (2ª etapa)**: adapters Anthropic / Gemini / OpenAI-Grok + dispatcher `responder()`. Exigem os 3 SDKs como dependência. ⚠️ Ao converter tools para o Gemini, **omitir `parameters` quando não houver argumento**: OBJECT com `properties` vazio devolve 400 e derruba a conversa inteira, não só a chamada
- [ ] `agenda/` (Bloco 2), `clientes/` (Bloco 2), `arvore/` (Fase C), `financeiro/` + `payment-provider/` (Fase F), `lgpd/` (Bloco 6), `email/` (port do ev-tracker — doc 08)
