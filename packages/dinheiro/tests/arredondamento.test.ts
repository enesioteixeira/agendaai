import { describe, expect, it } from 'vitest'

import { Dinheiro, ESCALA_TOTAL, ESCALA_UNITARIO, escalaDerivada } from '../src/index'

const INTEIRO = escalaDerivada(0)
const DECIMO = escalaDerivada(1)
const MILESIMO = escalaDerivada(3)

/**
 * Estes testes são a trava da regra de arredondamento. Se alguém trocar o modo por
 * "meio para cima" no sentido literal, ou pelo bancário, os casos de meio no negativo e
 * o `'0.5'` positivo quebram — e são exatamente os que passariam despercebidos numa
 * suíte que só testasse 2,4 e 2,6.
 */
describe('arredondamento comercial (meio para longe do zero)', () => {
  const casosDeMeio: ReadonlyArray<readonly [string, string]> = [
    ['0.5', '1'],
    ['1.5', '2'],
    ['2.5', '3'],
    ['3.5', '4'],
    ['-0.5', '-1'],
    ['-1.5', '-2'],
    ['-2.5', '-3'],
    ['-3.5', '-4'],
  ]

  for (const [entrada, esperado] of casosDeMeio) {
    it(`${entrada} arredonda para ${esperado}`, () => {
      expect(Dinheiro.deTexto(entrada, DECIMO).arredondar(INTEIRO).paraTexto()).toBe(esperado)
    })
  }

  it('diverge do Math.round justamente nos negativos', () => {
    // O que o JavaScript faz — meio na direção do infinito positivo:
    expect(Math.round(-2.5)).toBe(-2)
    expect(Math.round(-1.5)).toBe(-1)
    expect(Object.is(Math.round(-0.5), -0)).toBe(true)

    // O que o documento fiscal pede:
    expect(Dinheiro.deTexto('-2.5', DECIMO).arredondar(INTEIRO).paraTexto()).toBe('-3')
    expect(Dinheiro.deTexto('-1.5', DECIMO).arredondar(INTEIRO).paraTexto()).toBe('-2')
    expect(Dinheiro.deTexto('-0.5', DECIMO).arredondar(INTEIRO).paraTexto()).toBe('-1')
  })

  it('diverge do arredondamento bancário nos positivos', () => {
    // Bancário levaria 0,5 para 0 e 2,5 para 2 (o par mais próximo). É o padrão do
    // Math.Round do C#, e é o que este pacote não faz.
    expect(Dinheiro.deTexto('0.5', DECIMO).arredondar(INTEIRO).paraTexto()).toBe('1')
    expect(Dinheiro.deTexto('2.5', DECIMO).arredondar(INTEIRO).paraTexto()).toBe('3')
  })

  it('acerta os meios que o float perde antes mesmo de arredondar', () => {
    // toFixed opera sobre o binário: 2,675 e 1,005 não existem exatos em base 2, e o que
    // está lá é um pouquinho MENOR do que o decimal escrito.
    expect((2.675).toFixed(2)).toBe('2.67')
    expect((1.005).toFixed(2)).toBe('1.00')

    expect(Dinheiro.deTexto('2.675', MILESIMO).arredondar(ESCALA_TOTAL).paraTexto()).toBe('2.68')
    expect(Dinheiro.deTexto('1.005', MILESIMO).arredondar(ESCALA_TOTAL).paraTexto()).toBe('1.01')
    expect(Dinheiro.deTexto('-2.675', MILESIMO).arredondar(ESCALA_TOTAL).paraTexto()).toBe('-2.68')
  })

  it('não mexe em quem não está no meio', () => {
    expect(Dinheiro.deTexto('2.4', DECIMO).arredondar(INTEIRO).paraTexto()).toBe('2')
    expect(Dinheiro.deTexto('2.6', DECIMO).arredondar(INTEIRO).paraTexto()).toBe('3')
    expect(Dinheiro.deTexto('-2.4', DECIMO).arredondar(INTEIRO).paraTexto()).toBe('-2')
    expect(Dinheiro.deTexto('-2.6', DECIMO).arredondar(INTEIRO).paraTexto()).toBe('-3')
  })
})

describe('truncar', () => {
  it('descarta na direção do zero nos dois sinais', () => {
    expect(Dinheiro.deTexto('2.999', MILESIMO).truncar(ESCALA_TOTAL).paraTexto()).toBe('2.99')
    expect(Dinheiro.deTexto('-2.999', MILESIMO).truncar(ESCALA_TOTAL).paraTexto()).toBe('-2.99')
    // Não existe zero negativo em bigint: o que sobra é zero, e zero é o que se grava.
    expect(Dinheiro.deTexto('-0.001', MILESIMO).truncar(ESCALA_TOTAL).paraTexto()).toBe('0.00')
  })
})

describe('alargar escala', () => {
  it('é exato e não é arredondamento', () => {
    expect(Dinheiro.deTexto('1.5', DECIMO).arredondar(ESCALA_UNITARIO).paraTexto()).toBe(
      '1.5000000000',
    )
    expect(Dinheiro.deTexto('1.5', DECIMO).arredondar(ESCALA_UNITARIO).igual(
      Dinheiro.deTexto('1.5', DECIMO),
    )).toBe(true)
  })
})
