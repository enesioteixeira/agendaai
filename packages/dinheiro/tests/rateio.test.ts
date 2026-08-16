import { describe, expect, it } from 'vitest'

import {
  Dinheiro,
  ESCALA_QUANTIDADE,
  ESCALA_TOTAL,
  ESCALA_UNITARIO,
  dinheiro,
  ratear,
  ratearIgualmente,
  totalDoDocumento,
  totalDoItem,
} from '../src/index'

function textos(partes: readonly Dinheiro[]): string[] {
  return partes.map((parte) => parte.paraTexto())
}

function soma(partes: readonly Dinheiro[]): Dinheiro {
  return partes.reduce((total, parte) => total.somar(parte), Dinheiro.zero(ESCALA_TOTAL))
}

describe('rateio fecha com o total', () => {
  it('divide 100,00 em três e a sobra vai para a última', () => {
    const partes = ratearIgualmente(dinheiro('100.00'), 3)
    expect(textos(partes)).toEqual(['33.33', '33.33', '33.34'])
    expect(soma(partes).paraTexto()).toBe('100.00')
  })

  it('fecha também com total negativo', () => {
    const partes = ratearIgualmente(dinheiro('-100.00'), 3)
    expect(textos(partes)).toEqual(['-33.33', '-33.33', '-33.34'])
    expect(soma(partes).paraTexto()).toBe('-100.00')
  })

  it('rateia por peso proporcional', () => {
    const partes = ratear(dinheiro('10.00'), [
      dinheiro('100.00'),
      dinheiro('200.00'),
      dinheiro('300.00'),
    ])
    expect(textos(partes)).toEqual(['1.66', '3.33', '5.01'])
    expect(soma(partes).paraTexto()).toBe('10.00')
  })

  it('distribui a sobra pelo maior resto quando pedido', () => {
    const partes = ratear(
      dinheiro('10.00'),
      [dinheiro('100.00'), dinheiro('200.00'), dinheiro('300.00')],
      { sobra: 'DISTRIBUIDA' },
    )
    expect(textos(partes)).toEqual(['1.67', '3.33', '5.00'])
    expect(soma(partes).paraTexto()).toBe('10.00')
  })

  it('mostra o preço de jogar tudo na última quando há muitas partes', () => {
    // R$ 1,00 em 200 partes: cada uma trunca em zero e a sobra é o total inteiro.
    const naUltima = ratearIgualmente(dinheiro('1.00'), 200)
    expect(naUltima[0]?.paraTexto()).toBe('0.00')
    expect(naUltima[199]?.paraTexto()).toBe('1.00')
    expect(soma(naUltima).paraTexto()).toBe('1.00')

    const distribuida = ratearIgualmente(dinheiro('1.00'), 200, { sobra: 'DISTRIBUIDA' })
    expect(distribuida[0]?.paraTexto()).toBe('0.01')
    expect(distribuida[99]?.paraTexto()).toBe('0.01')
    expect(distribuida[100]?.paraTexto()).toBe('0.00')
    expect(soma(distribuida).paraTexto()).toBe('1.00')
  })

  it('fecha em toda combinação de total e número de partes', () => {
    // Gerador determinístico: a suíte tem de falhar sempre no mesmo caso, não às vezes.
    let semente = 987654321
    const proximo = (limite: number): number => {
      // Multiplicador pequeno de propósito: o produto tem de caber no inteiro seguro do
      // float, senão o próprio gerador do teste derrapa.
      semente = (semente * 48271) % 2147483647
      return semente % limite
    }

    for (let caso = 0; caso < 500; caso += 1) {
      const centavos = BigInt(proximo(50_000_000) - 25_000_000)
      const total = Dinheiro.deUnidadesMinimas(centavos, ESCALA_TOTAL)
      const quantidade = 1 + proximo(60)

      for (const sobra of ['ULTIMA', 'DISTRIBUIDA'] as const) {
        const partes = ratearIgualmente(total, quantidade, { sobra })
        expect(soma(partes).paraTexto()).toBe(total.paraTexto())
      }

      const pesos = Array.from({ length: quantidade }, () =>
        Dinheiro.deUnidadesMinimas(BigInt(proximo(100_000)), ESCALA_TOTAL),
      )
      if (pesos.some((peso) => !peso.ehZero())) {
        expect(soma(ratear(total, pesos)).paraTexto()).toBe(total.paraTexto())
      }
    }
  })
})

describe('rateio recusa o que não pode garantir', () => {
  it('sem partes', () => {
    expect(() => ratear(dinheiro('10.00'), [])).toThrow(RangeError)
  })

  it('pesos que somam zero', () => {
    expect(() => ratear(dinheiro('10.00'), [dinheiro('0'), dinheiro('0')])).toThrow(RangeError)
  })

  it('peso negativo', () => {
    expect(() => ratear(dinheiro('10.00'), [dinheiro('1.00'), dinheiro('-1.00')])).toThrow(
      RangeError,
    )
  })

  it('total que ainda não está arredondado na escala do rateio', () => {
    const bruto = dinheiro('3.0000', ESCALA_QUANTIDADE).multiplicar(
      dinheiro('1.1111', ESCALA_UNITARIO),
    )
    expect(() => ratear(bruto, [dinheiro('1'), dinheiro('1')], { escala: ESCALA_TOTAL })).toThrow(
      RangeError,
    )
  })
})

describe('onde arredondar', () => {
  it('arredonda no item e soma valores já fechados', () => {
    const quantidade = dinheiro('3.0000', ESCALA_QUANTIDADE)
    const unitario = dinheiro('19.99', ESCALA_UNITARIO)

    const item = totalDoItem(quantidade, unitario)
    expect(item.paraTexto()).toBe('59.97')
    expect(totalDoDocumento([item, item, item]).paraTexto()).toBe('179.91')
  })

  it('a diferença entre arredondar por item e arredondar no total é real, e o item vence', () => {
    const quantidade = dinheiro('1.0000', ESCALA_QUANTIDADE)
    const unitario = dinheiro('0.005', ESCALA_UNITARIO)

    const porItem = [1, 2, 3].map(() => totalDoItem(quantidade, unitario))
    expect(textos(porItem)).toEqual(['0.01', '0.01', '0.01'])
    expect(totalDoDocumento(porItem).paraTexto()).toBe('0.03')

    // Somar os produtos exatos e arredondar só no fim daria outro número — e é ele que
    // não bate com a soma das linhas impressas na nota.
    const exato = [1, 2, 3]
      .map(() => quantidade.multiplicar(unitario))
      .reduce((total, parcela) => total.somar(parcela))
    expect(exato.arredondar(ESCALA_TOTAL).paraTexto()).toBe('0.02')
  })

  it('o total do documento recusa item que não passou pelo arredondamento', () => {
    const bruto = dinheiro('3.0000', ESCALA_QUANTIDADE).multiplicar(
      dinheiro('1.1111', ESCALA_UNITARIO),
    )
    expect(() => totalDoDocumento([bruto])).toThrow(RangeError)
  })
})
