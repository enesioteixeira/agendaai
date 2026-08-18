# AGENTS.md — packages/dinheiro

## Propósito

Aritmética de dinheiro sobre **inteiros**, com escala explícita: soma, subtração, multiplicação por quantidade, arredondamento com modo declarado e **rateio que fecha** (a sobra de centavo é distribuída, nunca perdida nem inventada). Cópia adaptada de `@mensvra-erp/dinheiro`.

Existe porque a **regra inviolável 16** manda guardar valor monetário em centavos (Int) — e porque `0.1 + 0.2 !== 0.3` deixa de ser curiosidade quando vira a diferença entre o pedido e o boleto.

## Contratos

`src/index.ts`: `Dinheiro`, `dinheiro()`, `escalaDerivada`, `formatarBRL`, modos de arredondamento e as funções de rateio.

## Invariantes

1. **Nunca `number` de ponto flutuante para valor monetário** — a entrada vira inteiro na fronteira e só volta a texto na formatação.
2. Conversão que perderia precisão **levanta erro**, em vez de mostrar na tela um número diferente do que está no banco.
3. Rateio soma exatamente o total: a diferença de arredondamento é atribuída, não descartada.

## O que NUNCA fazer

- Nunca importar nada do monorepo aqui: o pacote é puro de propósito, e é isso que permite usá-lo no `apps/web`, no `apps/worker` e em teste sem arrastar Prisma nem React.
- Nunca "simplificar" para `number` porque um caso pareceu inofensivo.

## Dependências

Nenhuma. Importado por: `@atende/ui` (`formato/numero.ts`) e, a partir da Fase F, pelo domínio de catálogo/pedidos/cobrança.

## Comandos

```bash
pnpm --filter @atende/dinheiro typecheck
pnpm --filter @atende/dinheiro test
```

## Estado atual

- [x] `Dinheiro`, escala, arredondamento, formato BRL e rateio — 58 testes vindos do ERP, incluindo a suíte de precisão
