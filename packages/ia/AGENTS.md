# AGENTS.md — packages/ia

## Propósito

Adapters dos provedores de modelo (Anthropic, Gemini, OpenAI, xAI/Grok) e o dispatcher `responder()`. É a **camada anticorrupção de IA**: mesma regra de `@atende/canais` para canais — nada fora daqui importa SDK de modelo.

## Contratos

`OpcoesResponder` / `RespostaAgente` / `ToolDoTurno` vêm de `@atende/core/atendimento/ia` (`tipos.ts`). O formato canônico de ferramenta é o da **Anthropic** (`name` / `description` / `input_schema` em JSON Schema); cada adapter converte a partir dele.

Prompt, ferramentas e execução de ferramenta chegam **por parâmetro** — este pacote não conhece domínio. `executarTool` devolve o resultado **já empacotado** por `empacotarResultadoTool`: a moldura anti-injection é responsabilidade de quem executa, não de cada adapter (senão um deles esquece).

## Invariantes

1. **Só o `apps/worker` importa este pacote.** Turno de IA não roda no request do Cloudflare Workers: 10 ms de CPU contra um orçamento de 40 s (doc 12 §2.2). O `apps/web` importar isto arrastaria três SDKs para o bundle e ainda assim não funcionaria.
2. **O portão de PII fica no dispatcher**, não nos call sites — é o único ponto por onde todos os provedores passam, inclusive o próximo que alguém escrever. Padrão `mascarar`: se a config do tenant não chegou, o comportamento seguro é mascarar, não vazar.
3. **Só a contagem de PII vai para o log.** Registrar o valor mascarado desfaria o trabalho no arquivo de log.
4. **Timeout por requisição < orçamento do turno.** `TIMEOUT_IA_MS` (30 s) governa uma chamada; `ORCAMENTO_IA_MS` (40 s, em `@atende/core`) governa o turno inteiro com suas iterações.
5. **As decisões não moram aqui.** Orçamento, provedor reserva, classificação de erro e guardas são de `@atende/core/atendimento/ia`, puros e testados. Aqui é só tradução.

## O que NUNCA fazer

- **Nunca emitir um OBJECT com `properties` vazio para o Gemini.** Ele responde 400 e o 400 **derruba a conversa inteira**, não só aquela ferramenta — o agente sai do ar por completo. Ferramenta sem argumentos omite `parameters`. Preso por `gemini.test.ts`, que também testa o próprio detector (catraca que não detecta nada passa sempre).
- Nunca importar `@atende/db` ou `apps/*`: o motor recebe tudo por parâmetro, e é isso que permite testar o turno sem Postgres e trocar "chave da plataforma" por "chave do tenant" sem tocar aqui.
- Nunca montar prompt de domínio aqui — a persona nasce do `AgenteIA` do tenant (Fase D).
- Nunca deixar o modelo pedir ferramenta sem `executarTool` configurada: o adapter levanta erro alto de propósito, porque seguir devolveria ao cliente uma resposta montada sem o dado que ela promete.

## Dependências

Importa: `@atende/core`, `@anthropic-ai/sdk`, `@google/genai`, `openai`. Importado por: `apps/worker` (exclusivamente).

## Comandos

```bash
pnpm --filter @atende/ia typecheck
pnpm --filter @atende/ia test
```

## Estado atual

- [x] `anthropic.ts` — laço de tool use, prompt caching (`cache_control` no último item das tools + no system: o cache é por prefixo, então marcar o fim do bloco cacheia system e catálogo inteiro), anexos de imagem e PDF, contagem de tokens
- [x] `gemini.ts` — function calling, conversão de schema com o fix do OBJECT vazio, `thinkingConfig` (o 2.5 raciocina por padrão e os tokens de raciocínio contam no `maxOutputTokens` — com teto baixo a resposta volta VAZIA com `finishReason: MAX_TOKENS`)
- [x] `openai-compat.ts` — OpenAI e Grok num adapter só (a diferença cabe em baseURL + nome do parâmetro de tokens + env da chave); PDF vira aviso em vez de ser ignorado em silêncio; argumento com JSON inválido vira aviso e não derruba o turno
- [x] `index.ts` — dispatcher com portão de PII e import dinâmico por provedor
- [ ] **Verificação contra API real**: os adapters nunca falaram com os provedores neste projeto. Os testes cobrem a conversão de schema (que é onde o bug conhecido mora), não a ida e volta. Primeira execução real do `ia-turno` é o teste de fumaça que falta
- [ ] STT (transcrição de áudio) — port de `ev-tracker/src/lib/esteira/transcrever-core.ts`
