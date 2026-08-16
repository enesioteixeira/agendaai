'use client'

import type { ReactNode } from 'react'

import { cn } from '../base/cn'
import { Icone, type NomeDeIcone } from '../base/icones'
import { formatarNumero } from '../formato/numero'

export interface PropsChip {
  readonly children: ReactNode
  readonly ativo?: boolean
  readonly quantidade?: number | null
  readonly icone?: NomeDeIcone
  readonly title?: string
  readonly aoClicar?: () => void
  readonly className?: string
}

/**
 * Vira `<button>` quando tem ação e `<span>` quando não tem. Um `<span>` clicável não
 * recebe foco por teclado nem é anunciado como controle — e é assim que um filtro
 * inteiro fica inacessível sem ninguém notar.
 */
export function Chip({
  children,
  ativo = false,
  quantidade,
  icone,
  title,
  aoClicar,
  className,
}: PropsChip) {
  const conteudo = (
    <>
      {icone ? <Icone nome={icone} /> : null}
      <span>{children}</span>
      {quantidade === null || quantidade === undefined ? null : (
        <span className="ie-chip__qtd">{formatarNumero(quantidade)}</span>
      )}
    </>
  )

  const classe = cn('ie-chip', ativo && 'ie-chip--ativo', className)

  if (!aoClicar) {
    return (
      <span className={classe} {...(title === undefined ? {} : { title })}>
        {conteudo}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={classe}
      onClick={aoClicar}
      aria-pressed={ativo}
      {...(title === undefined ? {} : { title })}
    >
      {conteudo}
    </button>
  )
}

export interface OpcaoDeFiltro {
  readonly id: string
  readonly rotulo: string
  readonly quantidade?: number | null
  readonly icone?: NomeDeIcone
}

export interface PropsFiltroPilulas {
  readonly opcoes: readonly OpcaoDeFiltro[]
  /** `null` = nenhuma pílula ativa (o "Todos" implícito, quando `comTodos`). */
  readonly ativo: string | null
  readonly aoTrocar: (id: string | null) => void
  readonly comTodos?: boolean
  readonly rotuloDeTodos?: string
  readonly rotulo: string
  readonly className?: string
}

/**
 * Filtro de valor único em pílulas — o filtro de status de toda lista de ERP.
 *
 * Clicar na pílula ativa DESLIGA o filtro. Sem isso, a única saída seria a pílula
 * "Todos", e quem esconde essa opção (várias telas escondem, por espaço) deixa o
 * usuário preso no primeiro filtro que clicou.
 */
export function FiltroPilulas({
  opcoes,
  ativo,
  aoTrocar,
  comTodos = true,
  rotuloDeTodos = 'Todos',
  rotulo,
  className,
}: PropsFiltroPilulas) {
  return (
    <div className={cn('ie-pilulas', className)} role="group" aria-label={rotulo}>
      {comTodos ? (
        <Chip ativo={ativo === null} aoClicar={() => aoTrocar(null)}>
          {rotuloDeTodos}
        </Chip>
      ) : null}
      {opcoes.map((opcao) => (
        <Chip
          key={opcao.id}
          ativo={ativo === opcao.id}
          quantidade={opcao.quantidade}
          {...(opcao.icone === undefined ? {} : { icone: opcao.icone })}
          aoClicar={() => aoTrocar(ativo === opcao.id ? null : opcao.id)}
        >
          {opcao.rotulo}
        </Chip>
      ))}
    </div>
  )
}
