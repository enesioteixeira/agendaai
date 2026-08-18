# AGENTS.md — packages/integracoes

## Propósito

Hub de integrações de **retaguarda**: ERP e CRM. Camada anticorrupção no mesmo regime de `@atende/canais` — **nada fora deste pacote fala com API de ERP ou CRM**. O motor conversa com `ConectorERP`, e qual sistema está do outro lado é configuração do tenant. Spec: doc 12 §7.

## Contratos

- `src/tipos.ts` — `ConectorERP`, `ConectorCRM`, `CapacidadesErp`, `ErroIntegracao` com causa classificada.
- `src/formatos.ts` — formatos canônicos em **Zod v4** (via subpath `zod/v4`, doc 11). Payload de ERP de terceiro é entrada **não confiável**: campo faltando, número como string e data em formato próprio são o normal, não a exceção.
- `docs/contratos/erp-chanel-v1.md` — o contrato do Mensvra ERP, espelhado nos dois repositórios.

## Invariantes

1. **Dinheiro atravessa em centavos inteiros** (regra 16). Cada driver converte **antes** de entregar ao formato canônico — aceitar float aqui espalharia erro de arredondamento a partir de um único driver desleixado.
2. **O conector degrada, o motor nunca se adapta.** ERP que não emite Pix não vira `if` no meio da regra de venda: vira `cobrancaPix: false`, e a ferramenta não é oferecida ao agente.
3. **Toda escrita é idempotente por `idLocal`**, repassado como `Idempotency-Key`. Timeout no meio de uma criação é o caso comum — sem isso o cliente ganha dois pedidos.
4. **Validação na borda**: o que não bate com o schema não entra. Um preço vindo como string quebraria a soma do pedido lá adiante, longe da causa.
5. **Erro carrega causa classificada.** `indisponivel` e `limite` passam com o tempo; `credencial` e `recusado` não. Sem isso a fila reprocessa para sempre um pedido que o ERP recusou por regra de negócio.
6. **A assinatura HMAC do webhook é verificada na borda HTTP**, com o segredo do tenant, antes de o corpo chegar ao driver. Conferir dentro do driver permitiria chamá-lo sem passar pela verificação.

## O que NUNCA fazer

- **Nunca** acessar banco do ERP direto, nem correlacionar tenants por conta própria. O tenant do Channel informa a credencial do **seu** tenant no ERP (doc 12 §1.3).
- Nunca importar `@atende/db` ou `apps/*`.
- Nunca oferecer ao agente uma ferramenta cuja capacidade seja `false` — o modelo tentaria usar, receberia erro, e inventaria uma desculpa ou repetiria. Use `nomesHabilitados`.
- Nunca devolver lista vazia quando a capacidade não existe: vazio é lido como "não há produtos", e o agente diria ao cliente que o catálogo está vazio sem ninguém ter perguntado ao ERP. Use `exigirCapacidade`.

## Dependências

Importa: `zod`. Importado por: `apps/worker` (tools de ERP) e, futuramente, `apps/web` (tela de integrações — só tipos e capacidades).

## Comandos

```bash
pnpm --filter @atende/integracoes typecheck
pnpm --filter @atende/integracoes test
```

## Estado atual

- [x] Interface `ConectorERP`/`ConectorCRM`, capacidades e `ErroIntegracao` classificado
- [x] Formatos canônicos em Zod (produto, serviço, cliente, pedido, cobrança, evento de webhook, contato e oportunidade de CRM)
- [x] `degradacao.ts` — forma de cobrança, ferramentas habilitadas com **motivo escrito** (é o texto que a tela de integrações mostra), varredura de baixa só para quem cobra e não avisa, guarda de chamada
- [x] Driver `mensvra_erp` + **sandbox de contrato** (implementação de referência, não mock: já revelou um erro de roteamento no próprio driver)
- [ ] Drivers de mercado, na ordem do doc 12 §7.4: `sankhya` → `omie`/`bling`/`tiny`. **Nenhum pode começar sem credencial de sandbox do fornecedor** — escrever contra a documentação e descobrir na integração real é o caminho caro
- [ ] `ConectorCRM` implementado (`ploomes` → `rd_station` → `pipedrive`)
- [ ] Models `IntegracaoExterna` / `MapeamentoEntidade` / `SincronizacaoLog` + consumer `sync-erp` — **exigem migration**, e a do propose-confirm ainda não foi aplicada
