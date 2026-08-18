// Preco de IA em centavos de real. Aritmetica pura: sem banco, sem SDK, sem
// relogio — o preco de uma execucao nao muda depois que ela aconteceu, entao
// nem o instante precisa entrar.
//
// Por que a tabela mora no CODIGO e nao numa tabela editavel pelo painel: numero
// errado aqui vira fatura errada, e o doc 06 é explícito de que fatura-surpresa
// destrói mais conta de PME do que preço alto. Mudar preço passa por PR,
// revisão e CHANGELOG, com a cotação anotada junto.

/**
 * Procedência dos números da tabela abaixo.
 *
 * ⚠️ São **cotação de referência**, não fatura. Levantados em 2026-08-17 sobre
 * a tabela pública dos provedores, convertidos pela premissa P1 do doc 06
 * (US$ 1 = R$ 5,50). Antes de qualquer centavo ser cobrado de tenant, conferir
 * contra a fatura real do provedor — câmbio e preço de API mudam, e o doc 01
 * §6 já registra isso como risco com revisão trimestral.
 *
 * A constante é exportada de propósito: o painel de consumo mostra essa linha
 * junto do custo estimado, para que ninguém leia "R$ 3,71" como valor apurado.
 */
export const COTACAO_DE_REFERENCIA =
  "Cotação de referência de 2026-08-17, convertida a US$ 1 = R$ 5,50 (premissa P1 do doc 06). Valor estimado — conferir contra a fatura do provedor.";

export interface PrecoDoModelo {
  readonly entradaPorMilhaoCentavos: number;
  readonly saidaPorMilhaoCentavos: number;
}

/**
 * Consumo de tokens de UMA execução de modelo.
 *
 * Mesma forma de `UsoDeTokens` do motor de IA, declarada de novo aqui em vez de
 * importada: `plataforma` mede o consumo de qualquer coisa que gaste modelo, e
 * amarrar a cobrança ao contrato do `atendimento` faria a fatura quebrar quando
 * aquele contrato mudasse. Estruturalmente compatível — o worker passa o
 * `resposta.uso` direto.
 */
export interface UsoDeTokensDaExecucao {
  readonly entrada: number;
  readonly saida: number;
}

/**
 * Preço por milhão de tokens, em centavos, indexado por `provedor:modelo`.
 *
 * Só entram aqui os modelos que o produto realmente usa (doc 03: Gemini 2.5
 * Flash como padrão, Claude Haiku 4.5 na escalação). Preencher a tabela com
 * modelos que ninguém chamou seria inventar precisão: cada linha é um número
 * que alguém vai ter que defender contra uma fatura.
 */
export const PRECO_POR_MODELO: Readonly<Record<string, PrecoDoModelo>> = {
  // US$ 1,00 / US$ 5,00 por milhão.
  "anthropic:claude-haiku-4-5": { entradaPorMilhaoCentavos: 550, saidaPorMilhaoCentavos: 2750 },
  // US$ 3,00 / US$ 15,00 por milhão. Há preço promocional de entrada menor com
  // prazo; a tabela usa o CHEIO de propósito — cobrar pela promoção e depois
  // "corrigir" é exatamente a surpresa de fatura que o doc 06 proíbe.
  "anthropic:claude-sonnet-5": { entradaPorMilhaoCentavos: 1650, saidaPorMilhaoCentavos: 8250 },
  // US$ 5,00 / US$ 25,00 por milhão.
  "anthropic:claude-opus-5": { entradaPorMilhaoCentavos: 2750, saidaPorMilhaoCentavos: 13750 },
  // US$ 0,30 / US$ 2,50 por milhão.
  "gemini:gemini-2.5-flash": { entradaPorMilhaoCentavos: 165, saidaPorMilhaoCentavos: 1375 },
  // US$ 0,10 / US$ 0,40 por milhão.
  "gemini:gemini-2.5-flash-lite": { entradaPorMilhaoCentavos: 55, saidaPorMilhaoCentavos: 220 },
};

/**
 * Preço usado quando o par provedor/modelo não está na tabela.
 *
 * É o mais caro que conhecemos, e isso é decisão, não descuido: modelo
 * desconhecido custando ZERO significaria IA de graça e teto que nunca fecha —
 * o mesmo buraco que este módulo existe para tapar. Errando para cima, o teto
 * degrada mais cedo (fail-closed) e a distorção aparece no painel de consumo,
 * onde alguém a corrige acrescentando a linha que falta. Errando para baixo,
 * ninguém descobre até a fatura do provedor chegar.
 */
export const PRECO_DE_MODELO_DESCONHECIDO: PrecoDoModelo = {
  entradaPorMilhaoCentavos: 2750,
  saidaPorMilhaoCentavos: 13750,
};

/**
 * Chave canônica da tabela.
 *
 * `provedor` e `modelo` chegam como texto livre porque é assim que estão no
 * banco (`UsoIA.provedor` e `UsoIA.modelo` são `String`) e porque o registro
 * histórico não pode quebrar quando a lista de provedores homologados mudar.
 * A normalização evita que "Anthropic" e "anthropic" virem duas linhas de preço.
 */
export function chaveDoPreco(provedor: string, modelo: string): string {
  return `${provedor.trim().toLowerCase()}:${modelo.trim().toLowerCase()}`;
}

/** Preço da tabela, ou o de desconhecido. Nunca devolve `undefined`. */
export function precoDoModelo(provedor: string, modelo: string): PrecoDoModelo {
  return PRECO_POR_MODELO[chaveDoPreco(provedor, modelo)] ?? PRECO_DE_MODELO_DESCONHECIDO;
}

/** Contagem de token que o SDK devolveu não pode virar crédito na fatura. */
function tokensValidos(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Custo da execução em centavos, **sem arredondar**.
 *
 * Existe porque um turno típico custa fração de centavo: arredondar execução a
 * execução e só depois somar joga fora quase todo o consumo de quem usa modelo
 * barato. Quem acumula `UsoMensal.custoIaCentavos` soma ESTE valor ao longo do
 * mês e arredonda uma vez, no fechamento.
 */
export function custoDaExecucaoCentavosExato(
  uso: UsoDeTokensDaExecucao,
  provedor: string,
  modelo: string,
): number {
  const preco = precoDoModelo(provedor, modelo);
  const entrada = (tokensValidos(uso.entrada) / 1_000_000) * preco.entradaPorMilhaoCentavos;
  const saida = (tokensValidos(uso.saida) / 1_000_000) * preco.saidaPorMilhaoCentavos;
  return entrada + saida;
}

/**
 * Custo da execução em centavos inteiros — o que vai em `UsoIA.custoEstimadoCentavos`.
 *
 * Arredondamento comercial, e o viés é conhecido: turno muito curto vira zero
 * nesta linha. É aceito porque a linha do `UsoIA` é trilha de auditoria por
 * execução, e o total que cobra é o acumulado do mês, que soma o valor exato
 * (`custoDaExecucaoCentavosExato`). Arredondar para cima aqui custaria até um
 * centavo por turno — com ~10 turnos por conversa (premissa P2 do doc 06), 20%
 * em cima de um excedente de R$ 0,49.
 */
export function custoDaExecucaoCentavos(
  uso: UsoDeTokensDaExecucao,
  provedor: string,
  modelo: string,
): number {
  return Math.round(custoDaExecucaoCentavosExato(uso, provedor, modelo));
}
