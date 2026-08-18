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
- [x] `plataforma/`: **medição de consumo e teto por plano** — o que faltava para existir cobrança (antes disso, "teto de custo de IA por plano" era promessa de tela). Puro: o app lê `UsoMensal`/`PlanoLicenca` e passa por parâmetro:
  - `precos.ts` — `PRECO_POR_MODELO` (chave `provedor:modelo`) e o custo da execução em centavos. A tabela fica no **código** porque preço errado vira fatura errada, e os valores são **cotação de referência datada** (`COTACAO_DE_REFERENCIA`), a conferir contra a fatura do provedor antes de virar cobrança. Modelo fora da tabela cobra o preço mais caro conhecido — zero seria IA de graça e teto que nunca fecha. Há duas funções de propósito: `custoDaExecucaoCentavos` (inteiro, para a linha de `UsoIA`) e `custoDaExecucaoCentavosExato` (fracionário, o que o acumulador mensal soma — arredondar turno a turno zera o consumo de modelo barato)
  - `limites.ts` — `decidirTeto` (fail-closed, **não silencioso**: recusa o turno de IA e a conversa vai para fila humana + fluxo determinístico; avisa a 80% da franquia), `excedenteDoMesCentavos` (só as conversas acima do limite; plano sem IA não gera fatura, porque cobrar um vazamento do teto seria cobrar do cliente um bug nosso) e `podeCriar` (checagem de aplicação com motivo em PT-BR pronto para tela — a resposta a "estourou o limite" é upsell, não 500). **Convenção dos limites: zero = fora do plano, negativo = ilimitado**
  - `periodo.ts` — `mesReferencia` em UTC (é chave de `UsoMensal`; fuso local faria a mesma conversa cair em dois meses) e `mesSeguinte`, porque o excedente é cobrado no ciclo seguinte (doc 06 §1)
  - ⚠️ **Não decide assinatura**: `AssinaturaPlataforma` (trial vencido, inadimplente) é portão de sessão, não de consumo, e ainda não tem decisão neste package
- [x] **E1 — `atendimento/filas/`: roteamento e prazo das filas**, puro (o instante entra por parâmetro, a carga e o último atendente vêm por parâmetro):
  - `roteamento.ts` — `escolherAtendente` nas quatro distribuições. Sem sorteio: distribuição que muda de resposta entre duas chamadas iguais não se explica para quem opera nem se testa. Empate de `carga` é resolvido pelo **menor `usuarioId`**, não pela ordem do array — senão o resultado passa a depender do `ORDER BY` da consulta. Invariante acima de tudo: nunca devolve quem não é **membro ativo** (conversa atribuída a quem saiu da fila é conversa que ninguém vê)
  - `horario.ts` — expediente da fila no formato que o schema do banco já documenta (`{ fuso, dias: { seg: [["08:00","18:00"]] } }`), validado por Zod. **Configuração malformada devolve 24 por 7 em vez de estourar**: `horarioJson` vem do tenant e uma fila mal preenchida não pode derrubar a entrada de conversa das outras. Expediente sem nenhuma faixa também é 24 por 7, e não "fechada para sempre" — fechada para sempre faria toda conversa nascer sem prazo, em silêncio. A conversão parede→UTC é local ao módulo de propósito: `agenda/` está CONGELADO e não pode entrar no caminho crítico do atendimento
  - `prazo.ts` — `calcularPrazoPrimeiraResposta` **consome apenas tempo de fila aberta**: mensagem das 22h numa fila que abre às 8h tem prazo a partir das 8h (senão todo prazo da madrugada nasce estourado) e mensagem das 17h55 leva o resto do prazo para o dia seguinte (senão quem abre o painel às 8h já encontra a conversa vermelha sem ter tido chance). `situacaoDoPrazo` acende `perto_do_estouro` aos 80% do prazo e mede o que FALTA para o prazo absoluto — medir "80% do corrido" acenderia alerta às 5h da manhã de conversa com meia hora de expediente pela frente
- [ ] **Fase C (2ª etapa)**: adapters Anthropic / Gemini / OpenAI-Grok + dispatcher `responder()`. Exigem os 3 SDKs como dependência. ⚠️ Ao converter tools para o Gemini, **omitir `parameters` quando não houver argumento**: OBJECT com `properties` vazio devolve 400 e derruba a conversa inteira, não só a chamada
- [ ] `agenda/` (Bloco 2), `clientes/` (Bloco 2), `arvore/` (Fase C), `financeiro/` + `payment-provider/` (Fase F), `lgpd/` (Bloco 6), `email/` (port do ev-tracker — doc 08)
