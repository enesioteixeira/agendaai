# AGENTS.md — packages/canais

## Propósito

Camada **anticorrupção de canal**: cada canal (WhatsApp oficial, Baileys, Telegram, webchat, Instagram/Messenger, e-mail) é um conector que implementa a MESMA interface `Conector` e conversa com os motores só em formato canônico (`MensagemInboundNormalizada`/`MensagemOutbound`). Spec: doc 05 §1.

## Contratos

`src/tipos.ts` (interface `Conector`, capacidades) e `src/degradacao.ts` (botões → lista numerada + parser tolerante). Os schemas Zod das mensagens canônicas vivem em **`@atende/core/atendimento`** (contrato web↔worker: `mensagemInboundSchema`, `mensagemOutboundSchema`, `jobInboundSchema`, `jobEnviarSchema`) — `tipos.ts` deriva e reexporta os tipos (Bloco 3.2).

## Invariantes

1. **Único lugar do repo que importa SDK de canal** (Baileys, Graph API, grammY...).
2. `empresaId`/`canalId` vêm da rota/registro do webhook — **jamais do corpo do payload** (regra inviolável 3).
3. O conector **degrada**, o motor nunca se adapta (doc 05 §1.3): botões viram lista numerada, mídia sem suporte vira link.
4. Dedup por `(empresaId, canalId, idExterno)` — segunda entrega de webhook é descartada em silêncio.

## O que NUNCA fazer

- **Nunca** expor método de envio proativo no conector `whatsapp_baileys` — a restrição anti-ban é ESTRUTURAL (regra inviolável 12): template proativo só existe onde `capacidades.templates === true`.
- Nunca importar `@atende/db`, `apps/*` — só `@atende/core`.
- Nunca aceitar payload de webhook sem validação Zod.

## Dependências

Importa: `@atende/core`, `zod`. Importado por: `apps/worker` (exclusivamente — `apps/web` não importa canais; webhooks só enfileiram).

## Comandos

```bash
pnpm --filter @atende/canais typecheck
pnpm --filter @atende/canais test
```

## Estado atual

- [x] Interface `Conector` + formatos canônicos + degradação com parser tolerante (testado)
- [ ] Conector `whatsapp_oficial` (MVP — port de `ev-tracker/src/lib/whatsapp.ts`, doc 08 §3.1)
- [ ] Conector `whatsapp_baileys` (MVP — port de `ev-tracker/whatsapp-worker/`, doc 08 §3.2)
- [ ] `telegram`, `webchat`, `instagram`, `messenger`, `email` (Fase 2)
