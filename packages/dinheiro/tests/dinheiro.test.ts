import { describe, expect, it } from 'vitest'

import {
  Dinheiro,
  ESCALA_ALIQUOTA,
  ESCALA_QUANTIDADE,
  ESCALA_TOTAL,
  ESCALA_UNITARIO,
  dinheiro,
  escalaDerivada,
  type DecimalDoBanco,
} from '../src/index'

/**
 * Comparação em teste é sempre por `paraTexto()`. `toEqual` compara propriedades próprias
 * enumeráveis, e `Dinheiro` não tem nenhuma — os campos são privados —, então dois
 * valores diferentes passariam por iguais.
 */

/** Sósia do `Decimal` do Prisma: mesmos campos internos, mesmo `toFixed`. */
function decimalDoBanco(texto: string): DecimalDoBanco {
  const negativo = texto.startsWith('-')
  const semSinal = negativo ? texto.slice(1) : texto
  return {
    s: negativo ? -1 : 1,
    e: (semSinal.split('.')[0] ?? '').length - 1,
    d: [...semSinal.replace('.', '')].map(Number),
    toFixed: () => texto,
  } as DecimalDoBanco
}

describe('construção', () => {
  it('aceita texto decimal canônico', () => {
    expect(dinheiro('12.34').paraTexto()).toBe('12.34')
    expect(dinheiro('0').paraTexto()).toBe('0.00')
    expect(dinheiro('-1500.5').paraTexto()).toBe('-1500.50')
    expect(dinheiro('5.4990', ESCALA_UNITARIO).paraTexto()).toBe('5.4990000000')
  })

  it('aceita o Decimal que vem da coluna NUMERIC', () => {
    expect(Dinheiro.deBanco(decimalDoBanco('1234.56'), ESCALA_TOTAL).paraTexto()).toBe('1234.56')
    expect(Dinheiro.deBanco(decimalDoBanco('-0.07'), ESCALA_TOTAL).paraTexto()).toBe('-0.07')
    // Driver que devolve NUMERIC como texto também serve.
    expect(Dinheiro.deBanco('18.0000', ESCALA_ALIQUOTA).paraTexto()).toBe('18.0000')
  })

  it('aceita a forma digitada em pt-BR, e só nela o ponto agrupa milhar', () => {
    expect(Dinheiro.deTextoBrasileiro('1.234,56').paraTexto()).toBe('1234.56')
    expect(Dinheiro.deTextoBrasileiro('-0,07').paraTexto()).toBe('-0.07')
    expect(Dinheiro.deTextoBrasileiro('1234,56').paraTexto()).toBe('1234.56')
    // Ambíguo entre mil duzentos e trinta e quatro e um vírgula duzentos e trinta e quatro.
    expect(() => Dinheiro.deTextoBrasileiro('1.23')).toThrow(TypeError)
  })

  it('recusa texto que não cabe na escala sem perder valor', () => {
    expect(() => dinheiro('10.005')).toThrow(RangeError)
    // Zeros à direita não são perda.
    expect(dinheiro('10.5000').paraTexto()).toBe('10.50')
  })

  it('recusa notação exponencial', () => {
    expect(() => dinheiro('1e-3')).toThrow(TypeError)
    expect(() => dinheiro('1E5')).toThrow(TypeError)
  })
})

describe('float não entra', () => {
  it('não compila a partir de number', () => {
    // @ts-expect-error valor monetário não nasce de float
    expect(() => dinheiro(0.1)).toThrow(TypeError)
    // @ts-expect-error idem no construtor nomeado
    expect(() => Dinheiro.deTexto(12.34, ESCALA_TOTAL)).toThrow(TypeError)
    // @ts-expect-error idem na leitura do banco
    expect(() => Dinheiro.deBanco(12.34, ESCALA_TOTAL)).toThrow(TypeError)
    // @ts-expect-error idem em pt-BR
    expect(() => Dinheiro.deTextoBrasileiro(12.34)).toThrow(TypeError)
    // @ts-expect-error unidades mínimas são bigint, não number
    expect(() => Dinheiro.deUnidadesMinimas(1234, ESCALA_TOTAL)).toThrow(TypeError)
  })

  it('o Decimal do banco não é satisfeito por um number', () => {
    // A interface pede os campos internos do decimal.js. Se ela pedisse apenas `toFixed`,
    // `number` passaria — todo number tem toFixed.
    const naoCompila: DecimalDoBanco = { s: 1, e: 0, d: [1] }
    expect(naoCompila.s).toBe(1)
    // @ts-expect-error number não tem s/e/d
    const proibido: DecimalDoBanco = 12.34
    expect(typeof proibido).toBe('number')
  })

  it('só entra por deNumeroInseguro, e com justificativa escrita', () => {
    // @ts-expect-error a justificativa é obrigatória
    expect(() => Dinheiro.deNumeroInseguro(0.1, ESCALA_TOTAL)).toThrow(TypeError)
    expect(() => Dinheiro.deNumeroInseguro(0.1, ESCALA_TOTAL, 'legado')).toThrow(TypeError)

    const importado = Dinheiro.deNumeroInseguro(
      12.34,
      ESCALA_TOTAL,
      'planilha legada da migração de saldos, coluna VLR',
    )
    expect(importado.paraTexto()).toBe('12.34')
  })

  it('deNumeroInseguro assume o desvio que o float já trouxe, sem fingir exatidão', () => {
    const contaminado = 0.1 + 0.2
    expect(contaminado).not.toBe(0.3)

    const justificativa = 'valor recebido de integração que serializa em JSON number'
    const bruto = Dinheiro.deNumeroInseguro(contaminado, escalaDerivada(20), justificativa)
    expect(bruto.paraTexto()).toBe('0.30000000000000004000')

    const total = Dinheiro.deNumeroInseguro(contaminado, ESCALA_TOTAL, justificativa)
    expect(total.paraTexto()).toBe('0.30')
  })
})

describe('operações', () => {
  it('soma e subtrai alargando para a escala mais precisa', () => {
    const total = dinheiro('10.00')
    const unitario = dinheiro('0.0001', ESCALA_UNITARIO)

    expect(total.somar(unitario).paraTexto()).toBe('10.0001000000')
    expect(total.subtrair(unitario).paraTexto()).toBe('9.9999000000')
    expect(total.somar(unitario).escala.casas).toBe(ESCALA_UNITARIO.casas)
  })

  it('multiplica somando as casas dos fatores, sem arredondar por conta própria', () => {
    const quantidade = dinheiro('1.5000', ESCALA_QUANTIDADE)
    const unitario = dinheiro('5.4990', ESCALA_UNITARIO)
    const produto = quantidade.multiplicar(unitario)

    expect(produto.escala.casas).toBe(14)
    expect(produto.paraTexto()).toBe('8.24850000000000')
    expect(produto.arredondar(ESCALA_TOTAL).paraTexto()).toBe('8.25')
  })

  it('divide na escala pedida, com arredondamento comercial', () => {
    const um = dinheiro('1.00')
    const tres = dinheiro('3.00')
    expect(um.dividir(tres, ESCALA_TOTAL).paraTexto()).toBe('0.33')
    expect(um.dividir(tres, escalaDerivada(6)).paraTexto()).toBe('0.333333')
    expect(dinheiro('2.00').dividir(tres, escalaDerivada(6)).paraTexto()).toBe('0.666667')
    expect(dinheiro('-2.00').dividir(tres, escalaDerivada(6)).paraTexto()).toBe('-0.666667')
    expect(() => um.dividir(dinheiro('0.00'), ESCALA_TOTAL)).toThrow(RangeError)
  })

  it('nega e toma absoluto', () => {
    expect(dinheiro('-3.50').negar().paraTexto()).toBe('3.50')
    expect(dinheiro('-3.50').absoluto().paraTexto()).toBe('3.50')
    expect(dinheiro('3.50').absoluto().paraTexto()).toBe('3.50')
  })
})

describe('comparação', () => {
  it('compara valor, não escala', () => {
    const total = dinheiro('1.00')
    const aliquota = dinheiro('1.0000', ESCALA_ALIQUOTA)

    expect(total.igual(aliquota)).toBe(true)
    expect(total.comparar(aliquota)).toBe(0)
    expect(dinheiro('1.01').maiorQue(total)).toBe(true)
    expect(dinheiro('0.99').menorQue(total)).toBe(true)
    expect(total.maiorOuIgual(aliquota)).toBe(true)
    expect(total.menorOuIgual(aliquota)).toBe(true)
  })

  it('classifica sinal', () => {
    expect(dinheiro('0').ehZero()).toBe(true)
    expect(dinheiro('-0.01').ehNegativo()).toBe(true)
    expect(dinheiro('0.01').ehPositivo()).toBe(true)
  })
})

describe('a catraca da saída', () => {
  it('recusa gravar valor que ainda não coube na escala', () => {
    const produto = dinheiro('3.0000', ESCALA_QUANTIDADE).multiplicar(
      dinheiro('1.1111', ESCALA_UNITARIO),
    )

    expect(() => produto.paraBanco(ESCALA_TOTAL)).toThrow(RangeError)
    expect(produto.arredondar(ESCALA_TOTAL).paraBanco()).toBe('3.33')
  })

  it('deixa passar quando não há perda de verdade', () => {
    const exato = dinheiro('2.0000', ESCALA_QUANTIDADE).multiplicar(dinheiro('1.5', escalaDerivada(1)))
    expect(exato.paraBanco(ESCALA_TOTAL)).toBe('3.00')
  })

  it('recusa virar número por coerção implícita', () => {
    const a = dinheiro('10.00')
    const b = dinheiro('5.00')

    expect(() => (a as unknown as number) + (b as unknown as number)).toThrow(TypeError)
    expect(() => Number(a)).toThrow(TypeError)

    // Interpolação e serialização continuam funcionando, porque não são aritmética.
    expect(`${a}`).toBe('10.00')
    expect(String(a)).toBe('10.00')
    expect(JSON.stringify({ valor: a })).toBe('{"valor":"10.00"}')
  })
})
