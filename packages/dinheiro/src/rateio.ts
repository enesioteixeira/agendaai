import { potenciaDeDez } from './arredondamento'
import { Dinheiro } from './dinheiro'
import { ESCALA_TOTAL, type Escala } from './escala'

export type DestinoDaSobra =
  /**
   * A sobra inteira vai para a última parte. É a regra clássica do ERP fiscal e o padrão
   * aqui: previsível, auditável e trivial de conferir na mão — a última linha é a única
   * que pode divergir do proporcional.
   */
  | 'ULTIMA'
  /**
   * A sobra é distribuída de uma unidade mínima por vez, começando por quem teve o maior
   * resto na divisão. Vale quando a última parte é uma linha de mercadoria como as
   * outras: num frete rateado sobre 200 itens, `ULTIMA` empurra até R$ 1,99 para o item
   * final, e esse item passa a ter margem errada no relatório de rentabilidade.
   */
  | 'DISTRIBUIDA'

/** Peso é proporção, não valor: partes iguais são `1` para cada, sem casa decimal. */
const ESCALA_PESO: Escala = Object.freeze({ nome: 'peso', casas: 0 })

export interface OpcoesRateio {
  /** Escala das partes. O padrão é a escala do próprio total. */
  readonly escala?: Escala
  /** O padrão é `'ULTIMA'`. */
  readonly sobra?: DestinoDaSobra
}

/**
 * RATEIO QUE FECHA.
 *
 * O contrato é uma linha só e é o que importa: **a soma das partes é exatamente igual ao
 * total**, sempre, em qualquer escala, com qualquer conjunto de pesos, para total positivo
 * ou negativo. A função verifica isso antes de devolver.
 *
 * Por que não arredondar cada parte e torcer: arredondar para cima e para baixo de forma
 * independente faz a soma bater um pouco acima ou um pouco abaixo do total, e o erro cresce
 * com o número de partes. Numa NF-e isso é rejeição na hora (o vNF tem de conferir com a
 * soma), e num rateio de despesa é um centavo órfão que sobra no razão todo mês.
 *
 * O algoritmo: cada parte é TRUNCADA na escala pedida — nunca arredondada —, de modo que a
 * soma das partes nunca ultrapassa o total e a diferença tem sempre o mesmo sinal dele. A
 * diferença é então devolvida, inteira, segundo {@link DestinoDaSobra}.
 *
 * Truncar é o único ponto do pacote onde arredondar para o mais próximo estaria errado: o
 * valor individual da parte é menos importante que a identidade da soma.
 */
export function ratear(
  total: Dinheiro,
  pesos: readonly Dinheiro[],
  opcoes: OpcoesRateio = {},
): readonly Dinheiro[] {
  const escala = opcoes.escala ?? total.escala
  const sobra = opcoes.sobra ?? 'ULTIMA'

  if (pesos.length === 0) throw new RangeError('Rateio sem partes.')

  const totalUnidades = exigirNaEscala(total, escala)

  const casasDosPesos = pesos.reduce((maior, peso) => Math.max(maior, peso.escala.casas), 0)
  const pesosUnidades = pesos.map((peso) => {
    if (peso.ehNegativo()) {
      throw new RangeError(
        'Rateio com peso negativo. A garantia de fechamento depende de todos os pesos terem o ' +
          'mesmo sinal; para devolver valor, rateie o total negativo com pesos positivos.',
      )
    }
    return peso.unidadesMinimas * potenciaDeDez(casasDosPesos - peso.escala.casas)
  })

  const somaDosPesos = pesosUnidades.reduce((soma, peso) => soma + peso, 0n)
  if (somaDosPesos === 0n) {
    throw new RangeError('Rateio com pesos que somam zero: não há proporção a aplicar.')
  }

  // Divisão inteira do bigint trunca na direção do zero, nos dois sinais — é exatamente
  // o comportamento pedido, sem precisar tratar o negativo à parte.
  const partes = pesosUnidades.map((peso) => (totalUnidades * peso) / somaDosPesos)
  const distribuido = partes.reduce((soma, parte) => soma + parte, 0n)
  const resto = totalUnidades - distribuido

  if (resto !== 0n) {
    if (sobra === 'ULTIMA') {
      partes[partes.length - 1] = (partes[partes.length - 1] ?? 0n) + resto
    } else {
      distribuirDeUmEmUm(partes, pesosUnidades, totalUnidades, somaDosPesos, resto)
    }
  }

  const conferencia = partes.reduce((soma, parte) => soma + parte, 0n)
  if (conferencia !== totalUnidades) {
    throw new Error(
      `Rateio não fechou: partes somam ${conferencia} contra total ${totalUnidades} ` +
        `(unidades mínimas de ${escala.nome}). Isto é defeito do pacote, não do chamador.`,
    )
  }

  return partes.map((parte) => Dinheiro.deUnidadesMinimas(parte, escala))
}

/** Rateio em partes iguais — parcelamento de título, divisão de despesa por filial. */
export function ratearIgualmente(
  total: Dinheiro,
  quantidadeDePartes: number,
  opcoes: OpcoesRateio = {},
): readonly Dinheiro[] {
  if (!Number.isInteger(quantidadeDePartes) || quantidadeDePartes < 1) {
    throw new RangeError(`Quantidade de partes inválida: ${String(quantidadeDePartes)}.`)
  }
  const um = Dinheiro.deUnidadesMinimas(1n, ESCALA_PESO)
  return ratear(
    total,
    Array.from({ length: quantidadeDePartes }, () => um),
    opcoes,
  )
}

function exigirNaEscala(valor: Dinheiro, escala: Escala): bigint {
  if (!valor.cabeEm(escala)) {
    throw new RangeError(
      `Total a ratear não é exato em ${escala.nome} (${escala.casas} casas). Arredonde o ` +
        'total antes de distribuí-lo — senão o que fecha é um número que não existe.',
    )
  }
  return valor.arredondar(escala).unidadesMinimas
}

/**
 * Método do maior resto: quem perdeu mais na truncagem recebe primeiro. Empate resolve
 * pela ordem de entrada, para que dois rateios iguais devolvam sempre o mesmo resultado.
 */
function distribuirDeUmEmUm(
  partes: bigint[],
  pesosUnidades: readonly bigint[],
  totalUnidades: bigint,
  somaDosPesos: bigint,
  resto: bigint,
): void {
  const passo = resto < 0n ? -1n : 1n
  let restante = resto < 0n ? -resto : resto

  const restos = pesosUnidades.map((peso, indice) => {
    const produto = totalUnidades * peso
    const sobra = produto % somaDosPesos
    return { indice, sobra: sobra < 0n ? -sobra : sobra }
  })
  restos.sort((a, b) => (a.sobra === b.sobra ? a.indice - b.indice : a.sobra > b.sobra ? -1 : 1))

  for (const { indice } of restos) {
    if (restante === 0n) break
    partes[indice] = (partes[indice] ?? 0n) + passo
    restante -= 1n
  }

  if (restante !== 0n) {
    throw new Error(`Sobra de ${restante} unidades maior que o número de partes.`)
  }
}

/**
 * Total de um item: quantidade vezes valor unitário, ARREDONDADO no item.
 *
 * Onde arredondar não é preferência de estilo. O total do documento tem de bater com a
 * soma dos totais de item, e é o total de item que vai gravado no XML — então o
 * arredondamento acontece uma vez, aqui, e o documento soma valores já arredondados.
 * Somar os produtos exatos e arredondar só no fim dá um total que não corresponde a
 * nenhuma soma das linhas impressas.
 */
export function totalDoItem(
  quantidade: Dinheiro,
  valorUnitario: Dinheiro,
  escala: Escala = ESCALA_TOTAL,
): Dinheiro {
  return quantidade.multiplicar(valorUnitario).arredondar(escala)
}

/**
 * Total do documento: soma de valores JÁ arredondados na escala do documento.
 *
 * Recusa item fora da escala em vez de arredondar por conta própria — se um valor
 * intermediário chegou aqui, o arredondamento por item foi pulado em algum lugar, e
 * arredondar agora esconderia isso.
 */
export function totalDoDocumento(
  totaisDeItem: readonly Dinheiro[],
  escala: Escala = ESCALA_TOTAL,
): Dinheiro {
  let total = Dinheiro.zero(escala)
  for (const [indice, item] of totaisDeItem.entries()) {
    if (!item.cabeEm(escala)) {
      throw new RangeError(
        `Item ${indice} não está arredondado em ${escala.nome}. O total do documento soma ` +
          'valores de item já fechados — use totalDoItem() para produzi-los.',
      )
    }
    total = total.somar(item.arredondar(escala))
  }
  return total
}
