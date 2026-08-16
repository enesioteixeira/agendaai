import { Dinheiro, dinheiro, escalaDerivada, formatarBRL } from '@atende/dinheiro'

/**
 * NÚMEROS EM pt-BR.
 *
 * Há duas famílias aqui, e confundi-las é o defeito que este arquivo existe para
 * evitar:
 *
 * 1. CONTAGEM (`formatarNumero`) — quantos pedidos, quantas linhas, quantos dias.
 *    Cardinalidade nasce inteira, cabe em `number` sem perda e é o que o rodapé de
 *    recorte imprime.
 * 2. GRANDEZA EXATA (`formatarMoeda`, `formatarQuantidade`, `formatarPercentual`) —
 *    valor, quantidade comercial, alíquota. Essas atravessam a fronteira como
 *    {@link Dinheiro} ou como texto decimal, NUNCA como `number`: 0.1 + 0.2 não
 *    fecha, e o total que o usuário confere contra o extrato é o último lugar onde
 *    se pode reintroduzir float.
 *
 * O agrupamento de milhar é feito à mão, sobre o texto exato, pelo mesmo motivo que
 * `@atende/dinheiro` o faz: `Intl.NumberFormat` recebe `number`.
 */

/** O que se imprime no lugar de um valor que não existe. Nunca uma célula em branco. */
export const TRACO = '—'

function agruparMilhar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function casasNoTexto(texto: string): number {
  const ponto = texto.indexOf('.')
  return ponto === -1 ? 0 : texto.length - ponto - 1
}

/**
 * Texto decimal vira {@link Dinheiro} com a escala que o PRÓPRIO texto declara.
 * Forçar duas casas aqui truncaria `'5.4990'` (preço de combustível) para `'5.50'`
 * sem avisar ninguém.
 */
export function paraDinheiro(valor: Dinheiro | string): Dinheiro {
  if (typeof valor !== 'string') return valor
  const limpo = valor.trim()
  return dinheiro(limpo, escalaDerivada(Math.max(2, casasNoTexto(limpo))))
}

/**
 * Contagem em pt-BR: `1.284`, `-7`, `1.284,50` com casas.
 *
 * `NaN` e infinito viram {@link TRACO}: um grid de ERP que imprime "NaN" numa coluna
 * de total é pior do que um que imprime traço, porque parece um número.
 */
export function formatarNumero(valor: number, casas = 0): string {
  if (!Number.isFinite(valor)) return TRACO
  const texto = Math.abs(valor).toFixed(casas)
  const [inteiro = '0', fracao = ''] = texto.split('.')
  const corpo = fracao === '' ? agruparMilhar(inteiro) : `${agruparMilhar(inteiro)},${fracao}`
  // `-0` existe em IEEE-754 e imprimir "-0" numa coluna de saldo é ruído.
  const negativo = valor < 0 && Number(texto) !== 0
  return `${negativo ? '-' : ''}${corpo}`
}

/**
 * `R$ 1.284,50`, `-R$ 0,07`.
 *
 * Sem `casas`, respeita a escala do valor — `formatarMoeda('5.4990')` devolve
 * `R$ 5,4990`, e não um arredondamento silencioso. Com `casas` menor que a escala,
 * `@atende/dinheiro` LEVANTA erro em vez de mostrar na tela um número diferente
 * do que está gravado; quem quer arredondar arredonda antes, de propósito.
 */
export function formatarMoeda(valor: Dinheiro | string | null | undefined, casas?: number): string {
  if (valor === null || valor === undefined) return TRACO
  const exato = paraDinheiro(valor)
  return formatarBRL(exato, casas ?? Math.max(2, exato.escala.casas))
}

export interface OpcoesDeQuantidade {
  readonly unidade?: string
  readonly casas?: number
  /** Some as casas decimais quando todas são zero: `10 UN` em vez de `10,0000 UN`. */
  readonly enxugarZeros?: boolean
}

/** `1.250,0000 KG`, `10 UN`. */
export function formatarQuantidade(
  valor: Dinheiro | string | null | undefined,
  opcoes: OpcoesDeQuantidade = {},
): string {
  if (valor === null || valor === undefined) return TRACO
  const exato = paraDinheiro(valor)
  const casas = opcoes.casas ?? exato.escala.casas
  let texto = formatarBRL(exato, casas).replace('R$ ', '')
  if (opcoes.enxugarZeros !== false) {
    texto = texto.replace(/(,\d*?)0+$/, '$1').replace(/,$/, '')
  }
  return opcoes.unidade ? `${texto} ${opcoes.unidade}` : texto
}

/**
 * `18,00%` a partir de pontos percentuais.
 *
 * Aceita `number` porque percentual de painel (75% de atingimento) é razão calculada
 * na hora, não grandeza gravada. Alíquota fiscal vem como texto ou {@link Dinheiro} e
 * segue exata.
 */
export function formatarPercentual(
  valor: Dinheiro | string | number | null | undefined,
  casas = 2,
): string {
  if (valor === null || valor === undefined) return TRACO
  if (typeof valor === 'number') return `${formatarNumero(valor, casas)}%`
  return `${formatarQuantidade(valor, { casas, enxugarZeros: false })}%`
}

/**
 * `1 pedido` / `14 pedidos`. O plural irregular é declarado, nunca deduzido:
 * "títulos" sai de "título", mas "notas fiscais" não sai de "nota fiscal" por regra.
 */
export function pluralizar(quantidade: number, singular: string, plural?: string): string {
  const substantivo = quantidade === 1 ? singular : (plural ?? `${singular}s`)
  return `${formatarNumero(quantidade)} ${substantivo}`
}
