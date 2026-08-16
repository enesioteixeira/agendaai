import { Dinheiro } from './dinheiro'
import { escalaDerivada, type Escala } from './escala'

/**
 * FORMATAÇÃO pt-BR feita à mão, a partir do texto exato.
 *
 * `Intl.NumberFormat` recebe `number`. Passar o valor por ele reintroduz o float
 * exatamente no último passo — o do número que o usuário lê e confere contra o extrato.
 * Acima de nove quatrilhões de centavos a conversão já perde dígito, e num ERP de holding
 * esse número aparece em total consolidado. O agrupamento de milhar é uma linha de código;
 * a conversão para float não valeria nem se fossem dez.
 *
 * A saída é sempre exata: como {@link Dinheiro.paraTexto} recusa estreitar com perda,
 * formatar um valor não arredondado levanta erro em vez de mostrar na tela um número
 * diferente do que está gravado.
 */

export interface OpcoesFormato {
  /** Casas exibidas. O padrão é a escala do próprio valor. */
  readonly casas?: number
  /** Prefixo do sinal negativo. `'-R$ 1.234,56'` por padrão, e não `'R$ -1.234,56'`. */
  readonly prefixo?: string
  readonly sufixo?: string
}

function formatar(valor: Dinheiro, opcoes: OpcoesFormato = {}): string {
  const casas = opcoes.casas ?? valor.escala.casas
  const escalaDeSaida: Escala =
    casas === valor.escala.casas ? valor.escala : escalaDerivada(casas)

  const texto = valor.paraTexto(escalaDeSaida)
  const negativo = texto.startsWith('-')
  const semSinal = negativo ? texto.slice(1) : texto
  const [inteiro = '0', fracao = ''] = semSinal.split('.')

  const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const corpo = fracao === '' ? agrupado : `${agrupado},${fracao}`

  return `${negativo ? '-' : ''}${opcoes.prefixo ?? ''}${corpo}${opcoes.sufixo ?? ''}`
}

/** `'R$ 1.234,56'`, `'-R$ 0,07'`. */
export function formatarBRL(valor: Dinheiro, casas = 2): string {
  return formatar(valor, { casas, prefixo: 'R$ ' })
}

/** `'1.234,5678'` — sem símbolo, para quantidade e valor unitário. */
export function formatarNumero(valor: Dinheiro, casas?: number): string {
  return casas === undefined ? formatar(valor) : formatar(valor, { casas })
}

/** `'18,00%'` a partir da alíquota em pontos percentuais. */
export function formatarPercentual(valor: Dinheiro, casas = 2): string {
  return formatar(valor, { casas, sufixo: '%' })
}
