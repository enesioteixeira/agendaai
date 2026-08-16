import { describe, expect, it } from 'vitest'

import {
  CHAVES_DE_STATUS,
  VOCABULARIO_DE_STATUS,
  definicaoDoStatus,
  ehChaveDeStatus,
  rotuloDoStatus,
  tomDoStatus,
  variavelDoTom,
  type TomDeStatus,
} from '../src/status/vocabulario'

const TONS: readonly TomDeStatus[] = [
  'neutro',
  'sucesso',
  'perigo',
  'atencao',
  'info',
  'acento',
  'roxo',
]

describe('vocabulário de status', () => {
  it('toda chave tem rótulo não vazio e tom conhecido', () => {
    for (const chave of CHAVES_DE_STATUS) {
      const definicao = definicaoDoStatus(chave)
      expect(definicao.rotulo.trim().length, chave).toBeGreaterThan(0)
      expect(TONS, chave).toContain(definicao.tom)
    }
  })

  /**
   * Sinônimo é o defeito que a lista fechada existe para impedir: dois rótulos iguais
   * significam duas chaves para o mesmo estado, e a partir daí ninguém consegue
   * responder "quantos documentos estão parados esperando alguém?".
   */
  it('não tem dois rótulos iguais', () => {
    const rotulos = CHAVES_DE_STATUS.map(rotuloDoStatus)
    expect(new Set(rotulos).size).toBe(rotulos.length)
  })

  it('o rótulo é texto de interface, com inicial maiúscula', () => {
    for (const chave of CHAVES_DE_STATUS) {
      const rotulo = rotuloDoStatus(chave)
      expect(rotulo[0], chave).toBe(rotulo[0]?.toUpperCase())
    }
  })

  it('reconhece chave do vocabulário e recusa vizinha inventada', () => {
    expect(ehChaveDeStatus('aprovado')).toBe(true)
    expect(ehChaveDeStatus('aguardado')).toBe(false)
    expect(ehChaveDeStatus('APROVADO')).toBe(false)
    expect(ehChaveDeStatus(null)).toBe(false)
  })

  it('mantém a semântica dos estados que decidem cor de tela', () => {
    expect(tomDoStatus('aprovado')).toBe('sucesso')
    expect(tomDoStatus('recusado')).toBe('perigo')
    expect(tomDoStatus('vencido')).toBe('perigo')
    expect(tomDoStatus('aguardando')).toBe('atencao')
    expect(tomDoStatus('rascunho')).toBe('neutro')
  })

  /**
   * Nenhum componente pode escrever cor. O tom vira variável CSS, e é `chassi.css` —
   * sobre os tokens do app — que decide o valor.
   */
  it('traduz tom em variável CSS, nunca em valor de cor', () => {
    for (const tom of TONS) {
      const variavel = variavelDoTom(tom)
      expect(variavel).toMatch(/^var\(--ui-[a-z-]+\)$/)
    }
    expect(variavelDoTom('neutro')).toBe('var(--ui-neutro)')
    expect(variavelDoTom('sucesso')).toBe('var(--ui-sucesso)')
  })

  it('a lista exportada bate com o objeto do vocabulário', () => {
    expect(CHAVES_DE_STATUS).toHaveLength(Object.keys(VOCABULARIO_DE_STATUS).length)
  })
})
