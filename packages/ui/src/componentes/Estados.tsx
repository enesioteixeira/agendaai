'use client'

import type { ReactNode } from 'react'

import { cn } from '../base/cn'
import { Icone, type NomeDeIcone } from '../base/icones'
import { Botao } from './Botao'

/**
 * Os três estados que toda consulta tem além do "deu certo e tem dado". Eles existem
 * como componente porque, escritos à mão em 47 telas, viram 47 textos diferentes — e o
 * pior deles é o vazio silencioso: uma tabela sem linhas e sem explicação, que o
 * usuário lê como sistema quebrado quando na verdade o filtro é que não casou.
 */

export interface PropsEstadoVazio {
  readonly titulo: string
  /** Diga o que fazer, não só que não há nada: "nenhum pedido nos últimos 90 dias". */
  readonly descricao?: string
  readonly icone?: NomeDeIcone
  readonly acao?: ReactNode
  readonly className?: string
}

export function EstadoVazio({
  titulo,
  descricao,
  icone = 'caixa',
  acao,
  className,
}: PropsEstadoVazio) {
  return (
    <div className={cn('ie-vazio', className)}>
      <Icone nome={icone} className="ie-vazio__icone" />
      <p className="ie-vazio__titulo">{titulo}</p>
      {descricao ? <p className="ie-vazio__texto">{descricao}</p> : null}
      {acao}
    </div>
  )
}

export interface PropsEstadoDeErro {
  readonly mensagem: string
  readonly aoTentarDeNovo?: () => void
  readonly className?: string
}

export function EstadoDeErro({ mensagem, aoTentarDeNovo, className }: PropsEstadoDeErro) {
  return (
    <div className={cn('ie-erro', className)} role="alert">
      <Icone nome="alerta" className="ie-vazio__icone" />
      <p className="ie-vazio__texto">{mensagem}</p>
      {aoTentarDeNovo ? (
        <Botao icone="atualizar" onClick={aoTentarDeNovo}>
          Tentar de novo
        </Botao>
      ) : null}
    </div>
  )
}

export function Esqueleto({
  largura = '100%',
  altura = 12,
  className,
}: {
  readonly largura?: string | number
  readonly altura?: string | number
  readonly className?: string
}) {
  return (
    <span
      className={cn('ie-esqueleto', className)}
      style={{ display: 'block', width: largura, height: altura }}
      aria-hidden="true"
    />
  )
}

/**
 * O esqueleto da tabela imita a GRADE real, não uma barra genérica. É o que evita o
 * salto de layout quando os dados chegam — e salto de layout num grid denso faz o
 * usuário clicar na linha errada.
 */
export function EsqueletoDeTabela({
  linhas = 8,
  colunas = 5,
  alturaDaLinha = 32,
  grade,
}: {
  readonly linhas?: number
  readonly colunas?: number
  readonly alturaDaLinha?: number
  readonly grade?: string
}) {
  const gradeEfetiva = grade ?? `repeat(${colunas}, 1fr)`
  return (
    <div aria-hidden="true" aria-busy="true">
      {Array.from({ length: linhas }, (_, linha) => (
        <div
          key={linha}
          className="ie-tabela__linha"
          style={{ display: 'grid', gridTemplateColumns: gradeEfetiva, height: alturaDaLinha }}
        >
          {Array.from({ length: colunas }, (_, coluna) => (
            <div key={coluna} className="ie-tabela__cel">
              <Esqueleto largura={coluna === 0 ? '70%' : '45%'} altura={10} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
