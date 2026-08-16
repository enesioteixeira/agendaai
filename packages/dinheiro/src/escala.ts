/**
 * ESCALA — quantas casas decimais um número tem direito de ter, por contexto.
 *
 * Não existe "a precisão do sistema". Num documento fiscal brasileiro convivem, na mesma
 * linha, números com casas diferentes e obrigatórias, e tratá-los todos com duas casas
 * é o erro que produz nota rejeitada:
 *
 * - `vUnCom` (valor unitário) aceita até 10 casas no layout da NF-e. Combustível é
 *   cotado em 3 (R$ 5,499/L) e granel em 4 ou mais. Truncar em 2 na importação apaga
 *   um dígito que a SEFAZ já autorizou.
 * - `qCom` (quantidade) tem 4 casas.
 * - `pICMS` e as demais alíquotas têm até 4.
 * - `vProd`, `vBC`, `vNF` e todo o resto do dinheiro têm exatamente 2.
 *
 * A escala anda junto com o valor, e não como convenção na cabeça de quem escreveu a
 * função. É ela que define a unidade mínima do inteiro guardado por {@link Dinheiro}:
 * um valor de escala 2 é contado em centésimos, um de escala 10 em decimilionésimos de
 * centavo. Sem isso, "inteiro em unidade mínima" só serviria para dinheiro em reais.
 */
export interface Escala {
  /** Só aparece em mensagem de erro. A identidade de uma escala é o número de casas. */
  readonly nome: string
  readonly casas: number
}

/**
 * Teto de sanidade. Não é limite do `bigint` — que não tem — e sim o ponto a partir do
 * qual uma escala grande deixou de ser precisão e virou um laço que multiplicou escalas
 * sem ninguém arredondar no meio.
 */
export const CASAS_MAXIMAS = 28

function definir(nome: string, casas: number): Escala {
  return Object.freeze({ nome, casas })
}

/** Dinheiro. `vProd`, `vNF`, `vDesc`, `vFrete`, valor de título, saldo. */
export const ESCALA_TOTAL = definir('total', 2)

/**
 * Base de cálculo (`vBC`). Coincide com {@link ESCALA_TOTAL} hoje, e é declarada em
 * separado porque a coincidência é do layout, não da natureza: se um tributo futuro
 * pedir base com outra casa, muda aqui sem arrastar todos os totais junto.
 */
export const ESCALA_BASE = definir('base de cálculo', 2)

/** Valor unitário (`vUnCom`, `vUnTrib`). 10 é o teto do layout da NF-e. */
export const ESCALA_UNITARIO = definir('valor unitário', 10)

/** Quantidade (`qCom`, `qTrib`). */
export const ESCALA_QUANTIDADE = definir('quantidade', 4)

/** Alíquota em pontos percentuais (`pICMS`, `pPIS`, `pCOFINS`). 18,50 é `18.5000`. */
export const ESCALA_ALIQUOTA = definir('alíquota', 4)

/**
 * Escala sem contexto declarado, produzida por multiplicação. Existe para que o produto
 * de quantidade por unitário seja EXATO até alguém decidir onde arredondá-lo — o valor
 * intermediário não mente sobre sua precisão, e não pode ser gravado nem exibido sem que
 * essa decisão seja tomada.
 */
export function escalaDerivada(casas: number): Escala {
  if (!Number.isInteger(casas) || casas < 0) {
    throw new RangeError(`Escala precisa de um número inteiro de casas; recebido ${String(casas)}.`)
  }
  if (casas > CASAS_MAXIMAS) {
    throw new RangeError(
      `Escala de ${casas} casas passa do teto de ${CASAS_MAXIMAS}. ` +
        'Quase sempre isso é uma cadeia de multiplicações sem arredondamento no meio.',
    )
  }
  return definir(`derivada(${casas})`, casas)
}

/** Na soma de escalas diferentes, quem manda é a mais precisa: alargar nunca perde valor. */
export function escalaMaisLarga(a: Escala, b: Escala): Escala {
  return b.casas > a.casas ? b : a
}
