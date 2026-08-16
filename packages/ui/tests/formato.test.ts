import { dinheiro } from '@atende/dinheiro'
import { describe, expect, it } from 'vitest'

import {
  TRACO,
  diferencaEmDias,
  formatarCep,
  formatarChaveDeAcesso,
  formatarCnpj,
  formatarCpf,
  formatarData,
  formatarDataHora,
  formatarDocumento,
  formatarHora,
  formatarInscricaoEstadual,
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
  formatarQuantidade,
  formatarRelativo,
  formatarTelefone,
  lerData,
  pluralizar,
} from '../src/formato/index'

describe('números', () => {
  it('agrupa milhar e usa vírgula decimal', () => {
    expect(formatarNumero(1284)).toBe('1.284')
    expect(formatarNumero(1234567)).toBe('1.234.567')
    expect(formatarNumero(1284.5, 2)).toBe('1.284,50')
    expect(formatarNumero(-7)).toBe('-7')
  })

  // Um grid que imprime "NaN" numa coluna de total parece um número, e é lido como um.
  it('devolve traço para não-número em vez de imprimir NaN', () => {
    expect(formatarNumero(Number.NaN)).toBe(TRACO)
    expect(formatarNumero(Number.POSITIVE_INFINITY)).toBe(TRACO)
  })

  it('não imprime o zero negativo do IEEE-754', () => {
    expect(formatarNumero(-0)).toBe('0')
    expect(formatarNumero(-0.4)).toBe('0')
  })

  it('pluraliza com o plural declarado quando o "s" mentiria', () => {
    expect(pluralizar(1, 'pedido')).toBe('1 pedido')
    expect(pluralizar(14, 'pedido')).toBe('14 pedidos')
    expect(pluralizar(3, 'nota fiscal', 'notas fiscais')).toBe('3 notas fiscais')
    expect(pluralizar(0, 'título')).toBe('0 títulos')
  })
})

describe('dinheiro', () => {
  it('formata a partir de Dinheiro e de texto decimal', () => {
    expect(formatarMoeda(dinheiro('1284.50'))).toBe('R$ 1.284,50')
    expect(formatarMoeda('1284.5')).toBe('R$ 1.284,50')
    expect(formatarMoeda('-0.07')).toBe('-R$ 0,07')
    expect(formatarMoeda(null)).toBe(TRACO)
  })

  // O sinal vem ANTES do símbolo: 'R$ -1,00' é a forma que ninguém usa em português.
  it('põe o sinal antes do símbolo da moeda', () => {
    expect(formatarMoeda('-1284.50')).toBe('-R$ 1.284,50')
  })

  /**
   * O preço de combustível tem 3 e 4 casas. Se o formatador estreitasse para 2 por
   * conta própria, 5,4990 viraria 5,50 na tela — e a conferência contra a nota passaria
   * a acusar diferença que não existe no dado.
   */
  it('respeita a escala do valor em vez de arredondar em silêncio', () => {
    expect(formatarMoeda('5.4990')).toBe('R$ 5,4990')
    expect(() => formatarMoeda('5.4990', 2)).toThrow()
  })

  it('formata quantidade enxugando zeros e aceitando unidade', () => {
    expect(formatarQuantidade('1250.0000')).toBe('1.250')
    expect(formatarQuantidade('1250.4000')).toBe('1.250,4')
    expect(formatarQuantidade('10.5000', { unidade: 'KG' })).toBe('10,5 KG')
    expect(formatarQuantidade('10.5000', { enxugarZeros: false })).toBe('10,5000')
  })

  it('formata percentual de painel e alíquota exata', () => {
    expect(formatarPercentual(75, 0)).toBe('75%')
    expect(formatarPercentual('18.0000')).toBe('18,00%')
  })
})

describe('datas', () => {
  /**
   * `new Date('2026-08-09')` é meia-noite UTC: em qualquer fuso do Brasil, imprimir com
   * getDate() devolve o dia 8. É o bug de "a data do documento aparece um dia antes", e
   * ele só aparece para quem roda no fuso certo.
   */
  it('lê data sem hora literalmente, sem deslocar pelo fuso', () => {
    expect(formatarData('2026-08-09')).toBe('09/08/2026')
    expect(formatarData('2026-01-01')).toBe('01/01/2026')
    expect(lerData('2026-08-09')?.dia).toBe(9)
  })

  it('não inventa hora para uma data sem hora', () => {
    expect(formatarDataHora('2026-08-09')).toBe('09/08/2026')
    expect(formatarDataHora('2026-08-09T14:35:00')).toBe('09/08/2026 14:35')
    expect(formatarHora('2026-08-09T14:35:00')).toBe('14:35')
  })

  it('devolve traço para entrada vazia ou inválida', () => {
    expect(formatarData(null)).toBe(TRACO)
    expect(formatarData('')).toBe(TRACO)
    expect(formatarData('nada disso')).toBe(TRACO)
  })

  it('conta dias de calendário, não blocos de 24 horas', () => {
    expect(diferencaEmDias('2026-08-10T01:00:00', '2026-08-09T23:00:00')).toBe(1)
    expect(diferencaEmDias('2026-08-09', '2026-08-09')).toBe(0)
    expect(diferencaEmDias('2026-08-05', '2026-08-09')).toBe(-4)
  })

  it('descreve o tempo relativo a um agora explícito', () => {
    const agora = '2026-08-09T12:00:00'
    expect(formatarRelativo('2026-08-09T12:00:10', agora)).toBe('agora')
    expect(formatarRelativo('2026-08-09T11:30:00', agora)).toBe('há 30 min')
    expect(formatarRelativo('2026-08-09T09:00:00', agora)).toBe('há 3 h')
    expect(formatarRelativo('2026-08-08T09:00:00', agora)).toBe('ontem')
    expect(formatarRelativo('2026-08-10T09:00:00', agora)).toBe('amanhã')
    expect(formatarRelativo('2026-08-04T09:00:00', agora)).toBe('há 5 dias')
    expect(formatarRelativo('2026-11-09T09:00:00', agora)).toBe('em 3 meses')
    expect(formatarRelativo('2024-08-09T09:00:00', agora)).toBe('há 2 anos')
  })
})

describe('documentos', () => {
  it('mascara CNPJ, CPF e escolhe pelo comprimento', () => {
    expect(formatarCnpj('12345678000190')).toBe('12.345.678/0001-90')
    expect(formatarCpf('39055566604')).toBe('390.555.666-04')
    expect(formatarDocumento('12345678000190')).toBe('12.345.678/0001-90')
    expect(formatarDocumento('39055566604')).toBe('390.555.666-04')
  })

  /**
   * Documento com comprimento errado precisa APARECER errado. Formatá-lo à força
   * esconderia o dado quebrado, e um CNPJ truncado vira nota rejeitada na SEFAZ.
   */
  it('devolve sem máscara o que não tem o comprimento certo', () => {
    expect(formatarCnpj('1234567800019')).toBe('1234567800019')
    expect(formatarDocumento('123')).toBe('123')
    expect(formatarCnpj(null)).toBe(TRACO)
  })

  it('mascara CEP e telefone com e sem nono dígito', () => {
    expect(formatarCep('01310100')).toBe('01310-100')
    expect(formatarTelefone('1134567890')).toBe('(11) 3456-7890')
    expect(formatarTelefone('11934567890')).toBe('(11) 93456-7890')
    expect(formatarTelefone('5511934567890')).toBe('+55 (11) 93456-7890')
  })

  it('agrupa a chave de acesso de 44 dígitos em blocos de 4, como o DANFE imprime', () => {
    const chave = '3'.repeat(44)
    expect(formatarChaveDeAcesso(chave)).toBe(Array.from({ length: 11 }, () => '3333').join(' '))
    expect(formatarChaveDeAcesso('333')).toBe('333')
  })

  it('só mascara inscrição estadual de UF conhecida e preserva ISENTO', () => {
    expect(formatarInscricaoEstadual('110042490114', 'SP')).toBe('110.042.490.114')
    expect(formatarInscricaoEstadual('0623079004123', 'MG')).toBe('062.307.900/4123')
    // UF sem verbete: dígitos limpos, nunca máscara inventada.
    expect(formatarInscricaoEstadual('123456789', 'AC')).toBe('123456789')
    // Comprimento que não bate com a máscara da UF também sai limpo.
    expect(formatarInscricaoEstadual('123', 'SP')).toBe('123')
    expect(formatarInscricaoEstadual('isento')).toBe('ISENTO')
  })
})
