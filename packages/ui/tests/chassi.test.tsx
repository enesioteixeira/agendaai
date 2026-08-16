import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Badge, Botao, EstadoVazio, Icone, NOMES_DE_ICONE, cn } from '../src/index'

const RAIZ = join(import.meta.dirname, '..', 'src')

function arquivosDeCodigo(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return arquivosDeCodigo(caminho)
    return /\.tsx?$/.test(nome) ? [caminho] : []
  })
}

/**
 * CATRACA DE RESOLUÇÃO DE MÓDULO.
 *
 * O pacote de origem (`@instanterp/ui`) usa `nodenext` e escreve `from './x.js'`.
 * Este monorepo tem um regime só, `bundler`, e o webpack do Next NÃO reescreve
 * `.js` → `.ts`: um único import com extensão aqui derruba o build do `apps/web`
 * inteiro, e o Workers Builds falha de um jeito que deixa as rotas novas em 404
 * (doc 11, "Notas de resolução de módulos"). Como a cópia veio de lá, o erro
 * volta sozinho no dia em que alguém trouxer mais um arquivo do ERP.
 */
describe('resolução de módulo', () => {
  it('nenhum import relativo leva extensão .js', () => {
    const infratores = arquivosDeCodigo(RAIZ).filter((caminho) =>
      /from '\.\.?\/[^']*\.js'/.test(readFileSync(caminho, 'utf8')),
    )
    expect(infratores).toEqual([])
  })

  /**
   * O chassi é cópia adaptada, não dependência: um import remanescente do ERP
   * compila em silêncio enquanto o pacote existir no disco da máquina de quem
   * copiou, e quebra no CI de quem clonou o repo limpo.
   */
  it('não importa nada de @instanterp/*', () => {
    const infratores = arquivosDeCodigo(RAIZ).filter((caminho) =>
      /from '@instanterp\//.test(readFileSync(caminho, 'utf8')),
    )
    expect(infratores).toEqual([])
  })
})

describe('cn', () => {
  it('junta classes e descarta o que é falso', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })
})

describe('ícones', () => {
  it('inclui o vocabulário de atendimento que o chassi do ERP não tinha', () => {
    for (const nome of ['conversa', 'agente', 'antena', 'livro', 'plugue', 'engrenagem'] as const) {
      expect(NOMES_DE_ICONE).toContain(nome)
    }
  })

  it('renderiza herdando cor e corpo do texto — é o que faz os dois temas funcionarem', () => {
    const html = renderToStaticMarkup(<Icone nome="conversa" />)
    expect(html).toContain('stroke="currentColor"')
    expect(html).toContain('width="1em"')
    expect(html).toContain('aria-hidden="true"')
  })
})

describe('componentes', () => {
  it('Badge veste o tom pedido', () => {
    const html = renderToStaticMarkup(<Badge tom="atencao">Na fila</Badge>)
    expect(html).toContain('ie-badge--atencao')
    expect(html).toContain('Na fila')
  })

  it('Botao primário é um <button> de verdade, com type explícito', () => {
    const html = renderToStaticMarkup(<Botao variante="primario">Enviar</Botao>)
    expect(html).toContain('<button')
    expect(html).toContain('type="button')
    expect(html).toContain('ie-botao--primario')
  })

  it('EstadoVazio mostra a descrição — dizer o que fazer importa mais que dizer que está vazio', () => {
    const html = renderToStaticMarkup(
      <EstadoVazio
        icone="conversa"
        titulo="Nenhuma conversa aqui"
        descricao="Assim que um cliente escrever, ela aparece."
      />,
    )
    expect(html).toContain('Nenhuma conversa aqui')
    expect(html).toContain('Assim que um cliente escrever')
  })
})
