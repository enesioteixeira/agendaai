# Contrato Mensvra Channel ⇄ Mensvra ERP — v1

**Sumário.** Este documento define o contrato de API entre o **Mensvra Channel** (atendimento e venda por conversa) e o **Mensvra ERP** (retaguarda). O Channel é o **cliente**; o ERP é o **servidor**. O contrato é definido aqui porque o Channel precisa dele agora e o ERP ainda está na Onda 0 — quando o ERP implementar, este arquivo é a especificação, não uma sugestão.

**Estado:** v1, definido em 2026-08-16. **O lado ERP ainda não existe.** O driver do Channel (`packages/integracoes/src/mensvra-erp/`) roda contra um sandbox de fixtures que implementa este contrato — ver §7.

**Regra estrutural que governa tudo aqui:** são dois produtos independentes, com bancos independentes. Nunca acesso cruzado a banco, nunca dependência de código, e **nunca correlação de tenants feita pela plataforma** — o tenant do Channel informa a credencial do *seu* tenant no ERP, e ninguém deduz nada.

Este arquivo deve ser **espelhado nos dois repositórios**. Divergência entre as cópias é bug de contrato.

---

## 1. Autenticação

Chave por tenant, emitida pelo ERP, no formato `iep_live_<identificador>_<segredo>`.

```
Authorization: Bearer iep_live_a1b2c3d4_<segredo>
```

- O ERP guarda **SHA-256 do segredo**, nunca o segredo.
- Comparação com `timingSafeEqual`.
- A chave identifica o tenant no ERP. O Channel não envia identificador de empresa no corpo — se enviasse, o ERP teria duas fontes de verdade para a mesma pergunta, e a errada acabaria valendo.

**Erros:** `401` credencial inválida ou expirada · `403` chave válida sem escopo para a operação.

## 2. Envelope de resposta

Sucesso:

```json
{ "dados": { }, "meta": { } }
```

Erro:

```json
{ "erro": { "codigo": "saldo_insuficiente", "mensagem": "…", "detalhes": { } } }
```

`codigo` é **estável e faz parte do contrato** — o Channel classifica em cima dele. Mensagem é para humano e pode mudar; código, não.

## 3. Endpoints

Todos sob `/v1`. Valores monetários em **centavos inteiros**, sempre.

| Método | Rota | Uso no Channel |
|---|---|---|
| `GET` | `/v1/produtos?termo=&limite=&ativos=1` | tool `erpBuscarProdutos` — o agente oferta na conversa |
| `GET` | `/v1/servicos?termo=` | idem, para serviços |
| `GET` | `/v1/parceiros?documento=&telefone=` | achar o cliente antes de criar pedido |
| `POST` | `/v1/parceiros` | criar cliente que ainda não existe no ERP |
| `POST` | `/v1/pedidos` | execução da proposta `montar_pedido` |
| `POST` | `/v1/contratos` | execução da proposta `enviar_contrato` |
| `POST` | `/v1/cobrancas` | execução da proposta `gerar_cobranca` |
| `GET` | `/v1/cobrancas/{id}` | varredura de baixa quando não há webhook |

### 3.1 `GET /v1/produtos`

```json
{ "dados": [
  { "idExterno": "P-1", "codigo": "CT-001", "nome": "Corte masculino",
    "descricao": "…", "precoCentavos": 5000, "unidade": "UN",
    "estoque": 12, "ativo": true }
] }
```

`estoque` é `null` quando o ERP não controla estoque do item — **diferente de `0`**, que significa "controla e acabou". O agente precisa distinguir para não dizer "esgotado" sobre um serviço.

### 3.2 `POST /v1/pedidos`

```json
{ "idLocal": "cuid-do-pedido-no-channel",
  "idExternoCliente": "C-1",
  "itens": [{ "idExternoProduto": "P-1", "quantidade": 2, "precoUnitarioCentavos": 5000 }],
  "observacao": "Cliente pediu pela conversa do WhatsApp" }
```

Resposta `201`: `{ "dados": { "idExterno": "PED-1" } }`

### 3.3 `POST /v1/cobrancas`

```json
{ "idLocal": "cuid-da-cobranca-no-channel",
  "idExternoCliente": "C-1",
  "idExternoPedido": "PED-1",
  "valorCentavos": 10000,
  "vencimento": "2026-09-01T00:00:00.000Z",
  "descricao": "Pedido PED-1" }
```

Resposta `201`:

```json
{ "dados": { "idExterno": "COB-1",
             "pixCopiaECola": "00020126…",
             "linkPagamento": "https://…",
             "vencimento": "2026-09-01T00:00:00.000Z" } }
```

**Ao menos um entre `pixCopiaECola` e `linkPagamento` é obrigatório.** Os dois juntos são permitidos; nenhum dos dois é violação de contrato — sem forma de pagar, a cobrança não serve para nada e o Channel não teria o que mandar ao cliente.

## 4. Idempotência

**Todo `POST` aceita `Idempotency-Key`, e o Channel sempre envia** (usa o `idLocal`).

```
Idempotency-Key: cuid-do-pedido-no-channel
```

Chave repetida devolve **o mesmo recurso**, com o mesmo `idExterno`, sem criar outro.

Isto não é refinamento: **timeout no meio de uma criação é o caso comum, não o raro.** O worker reenvia, e sem idempotência o cliente ganha dois pedidos — e o segundo vira uma cobrança que ninguém pediu.

Janela mínima de memória da chave: **24 horas**.

## 5. Webhooks (ERP → Channel)

O ERP publica em uma URL que o tenant configura no Channel.

**Assinatura** — HMAC-SHA256 sobre `{timestamp}.{corpo cru}`:

```
X-Mensvra-Signature: t=1755360000,v1=<hex>
```

- O Channel recusa `timestamp` com mais de **5 minutos** de diferença (anti-replay).
- **Dois segredos ativos simultâneos**, para rotação sem janela de queda: o ERP assina com o novo, o Channel aceita os dois durante a virada.
- Comparação com `timingSafeEqual`.

**Eventos da v1:**

| Evento | Quando |
|---|---|
| `cobranca.paga` | baixa confirmada |
| `cobranca.cancelada` | cancelamento ou estorno |
| `pedido.faturado` | pedido virou nota |
| `contrato.ativado` | assinatura concluída |

Corpo:

```json
{ "evento": "cobranca.paga",
  "idExterno": "COB-1",
  "ocorridoEm": "2026-08-16T12:00:00.000Z",
  "valorCentavos": 10000,
  "dados": { } }
```

`ocorridoEm` é o instante do **evento**, não o do envio. Webhook reentregue horas depois precisa ser ordenável pelo instante real — senão uma baixa antiga sobrescreve um cancelamento novo.

**Entrega:** o Channel responde `200` rápido e processa em fila. O ERP deve reentregar em erro ou timeout, com backoff, por pelo menos 24 h. O Channel é idempotente por `(evento, idExterno, ocorridoEm)`.

## 6. Divisão de responsabilidade

| Assunto | Quem faz | Por quê |
|---|---|---|
| Catálogo, estoque, fiscal, financeiro | **ERP** | é a retaguarda |
| Conversa, agente de IA, proposta e confirmação | **Channel** | é a boca |
| **Régua de cobrança** (quando e por onde lembrar) | **Channel** | tem os canais e as regras de anti-ban; o ERP não sabe se o número pode receber proativo |
| **Fatos financeiros** (o que vence, o que foi pago) | **ERP** | é a fonte da verdade do dinheiro |
| Emissão do Pix | **ERP** | conta bancária e conciliação são dele |

A régua ilustra a divisão: o ERP diz *o que* está vencendo; o Channel decide *como* e *por onde* falar — e é ele que recusa mandar lembrete proativo por um canal não oficial (regra inviolável 12).

## 7. Sandbox de contrato

Enquanto o ERP não existe, `packages/integracoes/src/mensvra-erp/sandbox.ts` implementa este documento: confere o `Authorization` de verdade, honra `Idempotency-Key` de verdade, e responde nos formatos acima.

**Não é mock de teste — é a implementação de referência do contrato.** Quando o ERP subir, o mesmo conjunto de casos (`driver.test.ts`) vira o teste de conformidade dele: se o ERP real responder diferente do sandbox, um dos dois está fora do contrato, e a conversa passa a ser sobre qual — não sobre "funciona na minha máquina".

Ele já pagou por si: a primeira execução revelou um erro de roteamento no próprio driver (prefixo de `baseUrl`), que teria aparecido só na primeira integração real.

## 8. Versionamento

- Caminho `/v1` fixo. Campo **novo e opcional** não quebra versão.
- Mudança incompatível — campo removido, tipo alterado, semântica trocada — exige `/v2`, com os dois no ar durante a transição.
- Este arquivo é a fonte; as duas cópias (Channel e ERP) precisam bater. **Divergência entre elas é bug de contrato**, e o lado que divergiu é o que corrige.
