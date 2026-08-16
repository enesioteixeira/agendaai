import { describe, expect, it } from 'vitest'

import {
  ESCALA_ALIQUOTA,
  ESCALA_QUANTIDADE,
  ESCALA_UNITARIO,
  dinheiro,
  formatarBRL,
  formatarNumero,
  formatarPercentual,
} from '../src/index'

describe('formatação pt-BR', () => {
  it('agrupa milhar com ponto e separa a casa decimal com vírgula', () => {
    expect(formatarBRL(dinheiro('1234.56'))).toBe('R$ 1.234,56')
    expect(formatarBRL(dinheiro('0.07'))).toBe('R$ 0,07')
    expect(formatarBRL(dinheiro('100.00'))).toBe('R$ 100,00')
    expect(formatarBRL(dinheiro('1234567.89'))).toBe('R$ 1.234.567,89')
  })

  it('põe o sinal antes do símbolo', () => {
    expect(formatarBRL(dinheiro('-1234.56'))).toBe('-R$ 1.234,56')
    expect(formatarBRL(dinheiro('-0.07'))).toBe('-R$ 0,07')
  })

  it('formata quantidade e valor unitário sem símbolo', () => {
    expect(formatarNumero(dinheiro('37.5000', ESCALA_QUANTIDADE), 4)).toBe('37,5000')
    expect(formatarNumero(dinheiro('5.4990', ESCALA_UNITARIO), 4)).toBe('5,4990')
    expect(formatarNumero(dinheiro('1234.5678', ESCALA_QUANTIDADE), 4)).toBe('1.234,5678')
  })

  it('formata alíquota em pontos percentuais', () => {
    expect(formatarPercentual(dinheiro('18', ESCALA_ALIQUOTA))).toBe('18,00%')
    expect(formatarPercentual(dinheiro('1.65', ESCALA_ALIQUOTA))).toBe('1,65%')
    expect(formatarPercentual(dinheiro('4.5678', ESCALA_ALIQUOTA), 4)).toBe('4,5678%')
  })

  it('não passa por float nem nos valores que o float não representa', () => {
    // 2^53 centavos é R$ 90.071.992.547.409,91. Acima disso, converter para number para
    // usar Intl já teria perdido dígito antes de chegar na tela.
    expect(formatarBRL(dinheiro('99999999999999999.99'))).toBe(
      'R$ 99.999.999.999.999.999,99',
    )
  })

  it('recusa exibir um número diferente do que está gravado', () => {
    const bruto = dinheiro('1.0000', ESCALA_QUANTIDADE).multiplicar(
      dinheiro('0.005', ESCALA_UNITARIO),
    )
    expect(() => formatarBRL(bruto)).toThrow(RangeError)
  })
})
