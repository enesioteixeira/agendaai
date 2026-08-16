import { CASAS_MAXIMAS } from './escala'

/**
 * ARREDONDAMENTO — o comercial, e só ele.
 *
 * Documento fiscal brasileiro arredonda MEIO PARA LONGE DO ZERO: 2,5 vira 3 e -2,5 vira
 * -3. Isso não é o padrão de nenhuma das duas linguagens que este projeto considerou, e
 * o modo como cada uma erra é diferente — por isso os dois nomes enganam:
 *
 * - `Math.round` do JavaScript é MEIO PARA CIMA no sentido do infinito positivo:
 *   `Math.round(2.5) === 3`, mas `Math.round(-2.5) === -2`. Bate no caso positivo e
 *   diverge no negativo, que é exatamente a forma de erro que passa em revisão — devolução,
 *   desconto e estorno são a minoria das linhas, e são justamente as negativas.
 * - `Math.Round` do C# é BANCÁRIO por padrão: `Math.Round(2.5) === 2`. Diverge já no caso
 *   positivo, e num rateio de milhares de linhas o desvio se cancela em média — o que quer
 *   dizer que não aparece no total agregado, só no centavo de uma nota específica.
 *
 * Bibliotecas de decimal têm o mesmo problema com o nome: `ROUND_HALF_UP` do decimal.js
 * significa "longe do zero" (o que se quer), enquanto `ROUND_HALF_CEIL` é o que
 * `Math.round` faz. Chamar o modo certo pelo nome errado compila e passa nos testes
 * positivos.
 *
 * Aqui os dois modos existentes são fechados numa união de strings em português, sem
 * padrão global e sem configuração de biblioteca a ser esquecida: toda redução de casas
 * exige dizer qual dos dois se quer, na chamada.
 */
export type ModoArredondamento =
  /** Meio para LONGE DO ZERO. É o do documento fiscal. */
  | 'COMERCIAL'
  /** Descarta o excedente na direção do zero. Só o rateio usa — ver `ratear`. */
  | 'TRUNCAR'

const POTENCIAS: readonly bigint[] = Object.freeze(
  Array.from({ length: CASAS_MAXIMAS * 2 + 1 }, (_, expoente) => 10n ** BigInt(expoente)),
)

export function potenciaDeDez(expoente: number): bigint {
  const cacheada = POTENCIAS[expoente]
  if (cacheada !== undefined) return cacheada
  if (!Number.isInteger(expoente) || expoente < 0) {
    throw new RangeError(`Expoente inválido: ${String(expoente)}.`)
  }
  return 10n ** BigInt(expoente)
}

/**
 * Move `unidades` de uma escala para outra. Alargar é exato; estreitar aplica `modo`.
 *
 * Toda a aritmética decimal do pacote passa por aqui, e ela é inteira: nenhum passo
 * intermediário vira `number`, então não existe o erro de representação que faria
 * 2,675 chegar aqui como 2,67499999999999982 e arredondar para baixo.
 */
export function reescalar(
  unidades: bigint,
  deCasas: number,
  paraCasas: number,
  modo: ModoArredondamento,
): bigint {
  if (paraCasas === deCasas) return unidades
  if (paraCasas > deCasas) return unidades * potenciaDeDez(paraCasas - deCasas)

  const divisor = potenciaDeDez(deCasas - paraCasas)
  return modo === 'TRUNCAR'
    ? unidades / divisor
    : dividirComercial(unidades, divisor)
}

/**
 * Divisão inteira com meio para longe do zero.
 *
 * O sinal é extraído antes da conta: `bigint` divide truncando na direção do zero, então
 * comparar o resto direto trataria -0,5 e 0,5 de formas diferentes — e essa assimetria é
 * o bug do `Math.round`.
 */
export function dividirComercial(numerador: bigint, denominador: bigint): bigint {
  if (denominador === 0n) throw new RangeError('Divisão por zero.')

  const negativo = (numerador < 0n) !== (denominador < 0n)
  const n = numerador < 0n ? -numerador : numerador
  const d = denominador < 0n ? -denominador : denominador

  const quociente = n / d
  const resto = n % d
  const arredondado = resto * 2n >= d ? quociente + 1n : quociente

  return negativo ? -arredondado : arredondado
}

/** Verdadeiro quando estreitar de `deCasas` para `paraCasas` descartaria dígito não nulo. */
export function perderiaValor(unidades: bigint, deCasas: number, paraCasas: number): boolean {
  if (paraCasas >= deCasas) return false
  return unidades % potenciaDeDez(deCasas - paraCasas) !== 0n
}
