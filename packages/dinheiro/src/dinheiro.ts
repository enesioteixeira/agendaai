import {
  dividirComercial,
  perderiaValor,
  potenciaDeDez,
  reescalar,
  type ModoArredondamento,
} from './arredondamento'
import {
  CASAS_MAXIMAS,
  ESCALA_TOTAL,
  escalaDerivada,
  escalaMaisLarga,
  type Escala,
} from './escala'

/** Forma canônica de entrada: ponto como separador decimal, sem separador de milhar. */
const TEXTO_CANONICO = /^-?\d+(?:\.\d+)?$/

/** Forma pt-BR de entrada humana: ponto agrupa milhar, vírgula separa a casa decimal. */
const TEXTO_BRASILEIRO = /^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^-?\d+(?:,\d+)?$/

/**
 * O que chega do banco numa coluna `NUMERIC`: o `Decimal` do Prisma, que é o decimal.js.
 *
 * A interface pede os três campos internos do decimal.js em vez de pedir um método,
 * e isso é deliberado. `number` também tem `toFixed`, então uma interface estrutural
 * baseada no método aceitaria float em silêncio — que é exatamente o buraco que este
 * pacote existe para fechar. `s`, `e` e `d`, um `number` não tem.
 */
export interface DecimalDoBanco {
  /** Sinal. */
  readonly s: number
  /** Expoente. */
  readonly e: number
  /** Dígitos. */
  readonly d: readonly number[] | null
}

function exigirTexto(valor: unknown, origem: string): string {
  if (typeof valor === 'number') {
    throw new TypeError(
      `${origem} recebeu um number. Valor monetário não nasce de float — use uma string ` +
        "('12.34'), o Decimal vindo do banco, ou assuma o risco por escrito em deNumeroInseguro().",
    )
  }
  if (typeof valor !== 'string') {
    throw new TypeError(`${origem} espera uma string; recebido ${typeof valor}.`)
  }
  return valor.trim()
}

function unidadesDeTextoCanonico(texto: string, escala: Escala, origem: string): bigint {
  if (!TEXTO_CANONICO.test(texto)) {
    throw new TypeError(
      `${origem}: "${texto}" não está na forma decimal canônica (-?dígitos[.dígitos]). ` +
        'Notação exponencial e separador de milhar são recusados de propósito — ' +
        'para entrada digitada em pt-BR use deTextoBrasileiro().',
    )
  }

  const negativo = texto.startsWith('-')
  const semSinal = negativo ? texto.slice(1) : texto
  const [inteiro = '0', fracao = ''] = semSinal.split('.')

  if (fracao.length > CASAS_MAXIMAS) {
    throw new RangeError(`${origem}: "${texto}" tem mais de ${CASAS_MAXIMAS} casas decimais.`)
  }

  const unidades = BigInt(inteiro + fracao)
  const comSinal = negativo ? -unidades : unidades

  if (perderiaValor(comSinal, fracao.length, escala.casas)) {
    throw new RangeError(
      `${origem}: "${texto}" não cabe na escala ${escala.nome} (${escala.casas} casas) sem perder ` +
        'valor. Construa na escala em que o número veio e arredonde explicitamente depois.',
    )
  }

  return reescalar(comSinal, fracao.length, escala.casas, 'COMERCIAL')
}

/**
 * DINHEIRO — o número exato do ERP.
 *
 * O valor é um `bigint` na unidade mínima da sua {@link Escala}: R$ 12,34 em escala
 * `total` é `1234n`. Não existe `number` em lugar nenhum do caminho, nem na entrada, nem
 * no meio da conta, nem na formatação — não há ponto onde um binário base-2 possa
 * representar 0,1 por aproximação.
 *
 * A classe é a fronteira. `#unidades` é campo privado de verdade, então não há objeto
 * literal com o formato certo que passe por Dinheiro, e não há como montar um valor
 * pelas costas dos construtores.
 *
 * ARREDONDAR É SEMPRE EXPLÍCITO. Nenhuma operação reduz casas sozinha; quem reduz é
 * {@link Dinheiro.arredondar} ou {@link Dinheiro.truncar}. E como contrapartida, sair
 * do tipo — gravar, imprimir, formatar — RECUSA valor que ainda não coube na escala de
 * destino. Não dá para persistir um intermediário: ou ele já fecha, ou alguém decidiu.
 */
export class Dinheiro {
  readonly #unidades: bigint
  readonly #escala: Escala

  private constructor(unidades: bigint, escala: Escala) {
    this.#unidades = unidades
    this.#escala = escala
  }

  // ----------------------------------------------------------------- construção

  /** Entrada canônica: `'0'`, `'12.34'`, `'-1500.5000'`. */
  static deTexto(texto: string, escala: Escala = ESCALA_TOTAL): Dinheiro {
    const limpo = exigirTexto(texto, 'Dinheiro.deTexto')
    return new Dinheiro(unidadesDeTextoCanonico(limpo, escala, 'Dinheiro.deTexto'), escala)
  }

  /**
   * Entrada digitada por gente ou vinda de planilha: `'1.234,56'`, `'-0,5'`.
   *
   * Separada de {@link Dinheiro.deTexto} porque `'1.234'` vale mil duzentos e trinta e
   * quatro aqui e um vírgula duzentos e trinta e quatro lá. Uma função que aceitasse as
   * duas formas teria de adivinhar, e adivinhar errado num campo de valor é um erro de
   * três ordens de grandeza que ninguém percebe até o fechamento.
   */
  static deTextoBrasileiro(texto: string, escala: Escala = ESCALA_TOTAL): Dinheiro {
    const limpo = exigirTexto(texto, 'Dinheiro.deTextoBrasileiro').replace(/\s/g, '')
    if (!TEXTO_BRASILEIRO.test(limpo)) {
      throw new TypeError(`Dinheiro.deTextoBrasileiro: "${texto}" não é um valor pt-BR válido.`)
    }
    const canonico = limpo.replace(/\./g, '').replace(',', '.')
    return new Dinheiro(
      unidadesDeTextoCanonico(canonico, escala, 'Dinheiro.deTextoBrasileiro'),
      escala,
    )
  }

  /** Leitura de coluna `NUMERIC`, seja como `Decimal` do Prisma ou como texto do driver. */
  static deBanco(valor: DecimalDoBanco | string, escala: Escala): Dinheiro {
    const bruto: unknown = valor

    if (typeof bruto === 'string') {
      return new Dinheiro(unidadesDeTextoCanonico(bruto.trim(), escala, 'Dinheiro.deBanco'), escala)
    }
    if (typeof bruto === 'number') {
      throw new TypeError(
        'Dinheiro.deBanco recebeu um number. A coluna deveria ser NUMERIC e chegar como ' +
          'Decimal — number aqui significa que o mapeamento do Prisma está como Float.',
      )
    }
    if (bruto === null || typeof bruto !== 'object') {
      throw new TypeError(`Dinheiro.deBanco espera Decimal ou string; recebido ${typeof bruto}.`)
    }

    const comTexto = bruto as { toFixed?: unknown; toString(): string }
    const texto =
      typeof comTexto.toFixed === 'function'
        ? (comTexto as { toFixed(): string }).toFixed()
        : comTexto.toString()

    return new Dinheiro(unidadesDeTextoCanonico(texto, escala, 'Dinheiro.deBanco'), escala)
  }

  /** Construção direta na unidade mínima da escala. `1234n` em `total` é R$ 12,34. */
  static deUnidadesMinimas(unidades: bigint, escala: Escala): Dinheiro {
    if (typeof unidades !== 'bigint') {
      throw new TypeError(
        `Dinheiro.deUnidadesMinimas espera bigint (12345n), não ${typeof unidades}.`,
      )
    }
    return new Dinheiro(unidades, escala)
  }

  static zero(escala: Escala = ESCALA_TOTAL): Dinheiro {
    return new Dinheiro(0n, escala)
  }

  /**
   * ÚNICA PORTA DE ENTRADA DE FLOAT DO PACOTE, e ela é feia de propósito.
   *
   * O `number` já chega aqui contaminado — 0.1 + 0.2 é 0,30000000000000004 antes da
   * primeira linha desta função rodar, e nada aqui dentro desfaz isso. O que a função
   * faz é converter a expansão decimal real do float e arredondá-la, então o desvio
   * herdado vira um arredondamento assumido em vez de virar um número que parece exato.
   *
   * A justificativa é obrigatória porque o nome da variável no `grep` é a única forma
   * de saber, seis meses depois, de onde esse float veio e se ainda vem.
   */
  static deNumeroInseguro(valor: number, escala: Escala, justificativa: string): Dinheiro {
    if (typeof justificativa !== 'string' || justificativa.trim().length < 10) {
      throw new TypeError(
        'Dinheiro.deNumeroInseguro exige uma justificativa escrita (a origem do float).',
      )
    }
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      throw new TypeError(`Dinheiro.deNumeroInseguro: ${String(valor)} não é um número finito.`)
    }

    const texto = valor.toString()
    if (!TEXTO_CANONICO.test(texto)) {
      throw new RangeError(
        `Dinheiro.deNumeroInseguro: ${texto} sai em notação exponencial. Magnitude assim ` +
          'não passa por conversão de float — traga o valor como string.',
      )
    }

    const casas = texto.includes('.') ? (texto.split('.')[1]?.length ?? 0) : 0
    const bruto = Dinheiro.deTexto(texto, escalaDerivada(Math.max(casas, escala.casas)))
    return bruto.arredondar(escala)
  }

  // -------------------------------------------------------------------- leitura

  get escala(): Escala {
    return this.#escala
  }

  /** O inteiro guardado, na unidade mínima da escala atual. */
  get unidadesMinimas(): bigint {
    return this.#unidades
  }

  // ------------------------------------------------------------------ operações

  /**
   * As quatro operações mantêm o resultado EXATO. Soma e subtração alargam para a escala
   * mais precisa dos dois lados; multiplicação soma as casas dos fatores, porque é
   * quantas o produto realmente tem. Só a divisão precisa que se diga onde parar.
   */
  somar(outro: Dinheiro): Dinheiro {
    const escala = escalaMaisLarga(this.#escala, outro.#escala)
    return new Dinheiro(this.#naEscala(escala.casas) + outro.#naEscala(escala.casas), escala)
  }

  subtrair(outro: Dinheiro): Dinheiro {
    const escala = escalaMaisLarga(this.#escala, outro.#escala)
    return new Dinheiro(this.#naEscala(escala.casas) - outro.#naEscala(escala.casas), escala)
  }

  multiplicar(outro: Dinheiro): Dinheiro {
    const escala = escalaDerivada(this.#escala.casas + outro.#escala.casas)
    return new Dinheiro(this.#unidades * outro.#unidades, escala)
  }

  /**
   * Única operação que pode não ter resultado exato (1/3), e por isso a única que exige a
   * escala do resultado na chamada. O arredondamento é o comercial.
   */
  dividir(outro: Dinheiro, escala: Escala): Dinheiro {
    if (outro.#unidades === 0n) throw new RangeError('Divisão por zero.')

    const numerador =
      this.#unidades * potenciaDeDez(outro.#escala.casas) * potenciaDeDez(escala.casas)
    const denominador = outro.#unidades * potenciaDeDez(this.#escala.casas)

    return new Dinheiro(dividirComercial(numerador, denominador), escala)
  }

  negar(): Dinheiro {
    return new Dinheiro(-this.#unidades, this.#escala)
  }

  absoluto(): Dinheiro {
    return this.#unidades < 0n ? this.negar() : this
  }

  // -------------------------------------------------------------- arredondamento

  /** Meio para longe do zero. É o arredondamento do documento fiscal. */
  arredondar(escala: Escala): Dinheiro {
    return this.#reescalar(escala, 'COMERCIAL')
  }

  /** Descarta na direção do zero. Existe para o rateio; para valor final, use arredondar. */
  truncar(escala: Escala): Dinheiro {
    return this.#reescalar(escala, 'TRUNCAR')
  }

  /** Verdadeiro quando o valor já é exato na escala pedida — nada a decidir. */
  cabeEm(escala: Escala): boolean {
    return !perderiaValor(this.#unidades, this.#escala.casas, escala.casas)
  }

  // ---------------------------------------------------------------- comparação

  comparar(outro: Dinheiro): -1 | 0 | 1 {
    const casas = Math.max(this.#escala.casas, outro.#escala.casas)
    const a = this.#naEscala(casas)
    const b = outro.#naEscala(casas)
    if (a < b) return -1
    if (a > b) return 1
    return 0
  }

  /** Compara VALOR, não escala: `'1.00'` em total é igual a `'1.0000'` em alíquota. */
  igual(outro: Dinheiro): boolean {
    return this.comparar(outro) === 0
  }

  maiorQue(outro: Dinheiro): boolean {
    return this.comparar(outro) > 0
  }

  maiorOuIgual(outro: Dinheiro): boolean {
    return this.comparar(outro) >= 0
  }

  menorQue(outro: Dinheiro): boolean {
    return this.comparar(outro) < 0
  }

  menorOuIgual(outro: Dinheiro): boolean {
    return this.comparar(outro) <= 0
  }

  ehZero(): boolean {
    return this.#unidades === 0n
  }

  ehNegativo(): boolean {
    return this.#unidades < 0n
  }

  ehPositivo(): boolean {
    return this.#unidades > 0n
  }

  // ---------------------------------------------------------------------- saída

  /**
   * Texto decimal canônico, o mesmo que a coluna `NUMERIC` aceita.
   *
   * Recusa estreitar com perda. É aqui que "arredondar é explícito" deixa de ser
   * convenção: um produto de quantidade por unitário não chega ao banco sem alguém ter
   * escrito `arredondar(ESCALA_TOTAL)`.
   */
  paraTexto(escala: Escala = this.#escala): string {
    if (!this.cabeEm(escala)) {
      throw new RangeError(
        `Valor ${this.#texto(this.#escala.casas)} não cabe em ${escala.nome} ` +
          `(${escala.casas} casas) sem perder valor. Chame arredondar() ou truncar() antes.`,
      )
    }
    return this.#texto(escala.casas)
  }

  /** O que vai no `create`/`update` do Prisma para um campo `Decimal`. */
  paraBanco(escala: Escala = this.#escala): string {
    return this.paraTexto(escala)
  }

  toJSON(): string {
    return this.#texto(this.#escala.casas)
  }

  toString(): string {
    return this.#texto(this.#escala.casas)
  }

  /**
   * Recusa a coerção implícita para número. TypeScript já barra `a + b` entre Dinheiro,
   * mas o barramento em runtime é o que protege a fronteira com JavaScript e com `any`:
   * sem ele, `a + b` viraria concatenação de string e produziria "10.005.00", que é um
   * valor plausível o bastante para atravessar uma tela inteira sem ninguém notar.
   */
  [Symbol.toPrimitive](hint: string): string {
    if (hint === 'string') return this.#texto(this.#escala.casas)
    throw new TypeError(
      'Dinheiro não vira número nem entra em concatenação implícita. Use somar()/subtrair() ' +
        'para contas e paraTexto() ou formatarBRL() para texto.',
    )
  }

  // ------------------------------------------------------------------- internos

  /** Só é chamado com `casas` maior ou igual à própria: alarga, e alargar é exato. */
  #naEscala(casas: number): bigint {
    return reescalar(this.#unidades, this.#escala.casas, casas, 'TRUNCAR')
  }

  #reescalar(escala: Escala, modo: ModoArredondamento): Dinheiro {
    return new Dinheiro(reescalar(this.#unidades, this.#escala.casas, escala.casas, modo), escala)
  }

  #texto(casas: number): string {
    const unidades = reescalar(this.#unidades, this.#escala.casas, casas, 'TRUNCAR')
    const negativo = unidades < 0n
    const digitos = (negativo ? -unidades : unidades).toString().padStart(casas + 1, '0')
    const inteiro = casas === 0 ? digitos : digitos.slice(0, digitos.length - casas)
    const fracao = casas === 0 ? '' : `.${digitos.slice(digitos.length - casas)}`
    return `${negativo ? '-' : ''}${inteiro}${fracao}`
  }
}

/** Atalho de leitura para o caso comum. `dinheiro('12.34')` é um total em reais. */
export function dinheiro(texto: string, escala: Escala = ESCALA_TOTAL): Dinheiro {
  return Dinheiro.deTexto(texto, escala)
}
