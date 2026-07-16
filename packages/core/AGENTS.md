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
- [ ] `agenda/` (Bloco 2), `clientes/` (Bloco 2), `atendimento/` + `ia/` + `arvore/` (Blocos 3–4), `financeiro/` + `payment-provider/` (Bloco 5), `lgpd/` (Bloco 6), `email/` (port do ev-tracker — doc 08)
