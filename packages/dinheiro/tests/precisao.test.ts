import { describe, expect, it } from 'vitest'

import {
  Dinheiro,
  ESCALA_QUANTIDADE,
  ESCALA_TOTAL,
  ESCALA_UNITARIO,
  dinheiro,
  escalaDerivada,
  totalDoDocumento,
  totalDoItem,
} from '../src/index'

/**
 * Cada caso aqui roda duas vezes: uma em `number`, para registrar o valor errado que o
 * float produz, e uma no pacote. O par existe para que a próxima pessoa que pensar em
 * "usar number só nesta telinha" veja o número concreto que estaria mostrando.
 */
describe('o que quebra em float64', () => {
  it('0,1 + 0,2', () => {
    expect(0.1 + 0.2).toBe(0.30000000000000004)
    expect(0.1 + 0.2 === 0.3).toBe(false)

    const decimo = escalaDerivada(1)
    expect(dinheiro('0.1', decimo).somar(dinheiro('0.2', decimo)).paraTexto()).toBe('0.3')
    expect(dinheiro('0.1', decimo).somar(dinheiro('0.2', decimo)).igual(dinheiro('0.3', decimo))).toBe(
      true,
    )
  })

  it('somar 0,10 dez vezes', () => {
    let emFloat = 0
    for (let i = 0; i < 10; i += 1) emFloat += 0.1
    expect(emFloat).not.toBe(1)

    let total = Dinheiro.zero(ESCALA_TOTAL)
    for (let i = 0; i < 10; i += 1) total = total.somar(dinheiro('0.10'))
    expect(total.paraTexto()).toBe('1.00')
  })

  it('somar 0,01 dez mil vezes', () => {
    let emFloat = 0
    for (let i = 0; i < 10_000; i += 1) emFloat += 0.01
    expect(emFloat).not.toBe(100)

    let total = Dinheiro.zero(ESCALA_TOTAL)
    for (let i = 0; i < 10_000; i += 1) total = total.somar(dinheiro('0.01'))
    expect(total.paraTexto()).toBe('100.00')
  })

  it('nota com 200 itens de 3 × R$ 19,99', () => {
    let emFloat = 0
    for (let i = 0; i < 200; i += 1) emFloat += 3 * 19.99
    // O valor observado é 11993.999999999969: erra na quinta casa depois da vírgula, o
    // que numa tela de duas casas some, e num confronto com o XML da nota não some.
    expect(emFloat).not.toBe(11994)
    expect(emFloat).toBeCloseTo(11994, 6)

    const quantidade = dinheiro('3.0000', ESCALA_QUANTIDADE)
    const unitario = dinheiro('19.99', ESCALA_UNITARIO)
    const itens = Array.from({ length: 200 }, () => totalDoItem(quantidade, unitario))

    expect(itens[0]?.paraTexto()).toBe('59.97')
    expect(totalDoDocumento(itens).paraTexto()).toBe('11994.00')
  })

  it('nota com 200 itens de combustível, unitário com quatro casas', () => {
    // 37,5 litros a R$ 5,4990: 206,2125 por item, que arredonda para 206,21.
    const quantidade = dinheiro('37.5000', ESCALA_QUANTIDADE)
    const unitario = dinheiro('5.4990', ESCALA_UNITARIO)

    const exato = quantidade.multiplicar(unitario)
    expect(exato.paraTexto()).toBe('206.21250000000000')

    const itens = Array.from({ length: 200 }, () => totalDoItem(quantidade, unitario))
    expect(itens[0]?.paraTexto()).toBe('206.21')
    expect(totalDoDocumento(itens).paraTexto()).toBe('41242.00')
  })

  it('valores maiores do que o inteiro seguro do float', () => {
    // Consolidado de holding em centavos passa de 2^53 muito antes de passar do bigint.
    const enorme = dinheiro('99999999999999999.99')
    expect(enorme.somar(dinheiro('0.01')).paraTexto()).toBe('100000000000000000.00')
    expect(Number(enorme.unidadesMinimas) > Number.MAX_SAFE_INTEGER).toBe(true)
  })
})

describe('soma de muitos itens não deriva', () => {
  it('mil itens com unitário de quatro casas fecham no valor esperado', () => {
    const quantidade = dinheiro('1.0000', ESCALA_QUANTIDADE)
    const itens = Array.from({ length: 1000 }, (_, indice) =>
      totalDoItem(quantidade, dinheiro(`0.${String(1000 + (indice % 1000)).slice(1)}`, ESCALA_UNITARIO)),
    )

    // Cada item é 0,000 a 0,999 arredondado em duas casas; a conferência é feita somando
    // as mesmas parcelas em ordem inversa — resultado idêntico prova que não há
    // acumulação dependente de ordem, que é a assinatura da deriva de ponto flutuante.
    const direto = totalDoDocumento(itens)
    const inverso = totalDoDocumento([...itens].reverse())
    expect(direto.paraTexto()).toBe(inverso.paraTexto())
    expect(direto.paraTexto()).toBe('500.00')
  })
})
