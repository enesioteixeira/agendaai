# AGENTS.md — packages/ui

## Propósito

**Chassi de UI do Instant Channel**: a folha de estilo do produto e os componentes de apoio que toda tela reusa. É uma **cópia adaptada** de `@instanterp/ui` (o chassi do Instant ERP) — os dois produtos da família Instant compartilham a IDENTIDADE (paleta navy / azul elétrico / roxo, geometria, densidade), nunca o código vivo. Mesmo regime do `docs/08-reuso-ev-tracker.md`: cópia adaptada, nunca dependência. Plano: doc 12 §9.

## Contratos

`src/index.ts` é a superfície pública e traz, no cabeçalho, a lista do que ficou de fora da cópia com o motivo de cada bloco. A folha de estilo é export à parte e o app a importa **uma vez**:

```ts
import '@atende/ui/estilos.css'   // DEPOIS de globals.css — ver invariante 3
```

Os tokens de marca **não moram aqui**: moram em `apps/web/src/app/globals.css`. O chassi lê cada cor como `var(--token-do-app, literal)`, então o app sempre vence e o pacote continua funcionando sozinho (teste, outro app).

## Invariantes

1. **Nenhum import relativo leva extensão `.js`.** Regime único do monorepo é `bundler` e o webpack do Next não reescreve `.js` → `.ts`: um único import com extensão derruba o build do `apps/web` inteiro, e o Workers Builds falha deixando as rotas novas em **404** (doc 11). O pacote de origem usa `nodenext` e escreve `.js` — então o erro volta sozinho a cada arquivo novo trazido de lá. Preso por `tests/chassi.test.tsx`.
2. **Nada de `@instanterp/*`.** Import remanescente compila na máquina de quem copiou e quebra no CI de quem clonou. Preso pelo mesmo teste.
3. **Ordem das folhas no app**: `globals.css` primeiro, `@atende/ui/estilos.css` depois. O `@import 'tailwindcss'` do app traz o preflight, que zera borda e espaçamento; carregado por último ele desfaz as regras do chassi (mesma especificidade de classe) e a tela renderiza sem moldura — parecendo estilo faltando, não ordem trocada.
4. Cor literal só existe em `estilos/chassi.css`, e sempre como `var(--token, literal)`.
5. Ícone herda `currentColor` e `1em` — é o que faz tema claro e escuro funcionarem sem condicional.

## O que NUNCA fazer

- **Nunca** trazer `escopo/` do chassi do ERP (seletor de empresa/filial). No Instant Channel o tenant vem SEMPRE da sessão JWT e nunca de escolha na interface (**regra inviolável 3**) — um seletor de empresa na tela é caminho para trocar de tenant pela UI, e não existe versão "só visual" disso que seja segura. Por tabela, não trazer `telas/`, `tabela/` e `consulta/`, que dependem dele.
- Nunca importar `@atende/db`, `@atende/core` ou `apps/*` — a dependência é a inversa. Um chassi que conhece o app deixa de ser reusável no primeiro app novo.
- Nunca colocar regra de negócio, chamada de API ou texto de domínio aqui.
- Nunca reintroduzir `formulario/` sem antes remover os campos fiscais (CNPJ, NCM, inscrição estadual): eles arrastam `@instanterp/contracts`, que é domínio de ERP.

## Dependências

Importa: `@atende/dinheiro` (só em `formato/numero.ts`), `react` (peer). Importado por: `apps/web`.

## Comandos

```bash
pnpm --filter @atende/ui typecheck
pnpm --filter @atende/ui test
```

## Estado atual

- [x] `estilos/chassi.css` — folha única (anatomia de tela, botões, chips, badges, blocos, abas, modal, toasts, estados)
- [x] `base/` — `cn` e ícones, com o vocabulário de atendimento acrescentado (`conversa`, `agente`, `antena`, `livro`, `plugue`, `engrenagem`, `chave`)
- [x] `componentes/` — Botao, Badge, Chip/FiltroPilulas, BuscaLocal, Kpi, AbasInternas, Estados, Modal/Confirmar, Toast
- [x] `formato/` e `status/` — formatadores pt-BR e vocabulário de status
- [x] Catracas de resolução de módulo e de independência do ERP
- [ ] `formulario/` sem campos fiscais (quando o estúdio de agentes e o catálogo precisarem)
- [ ] `graficos/` (Fase D — painel de consumo e desempenho do agente)
- [ ] Componentes próprios da conversa: bolha de mensagem, composer, waveform de áudio (Fase B)
