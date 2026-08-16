'use client'

import type { ReactNode } from 'react'

import { cn } from '../base/cn'
import {
  rotuloDoStatus,
  tomDoStatus,
  type ChaveDeStatus,
  type TomDeStatus,
} from '../status/vocabulario'

/**
 * O selo de estado. Duas portas, e a diferença entre elas é intencional:
 *
 * `<Badge status="aprovado" />` — o caminho normal. A chave é fechada, o rótulo e o
 * tom saem do vocabulário, e "Aprovado" fica escrito igual nas 47 telas.
 *
 * `<Badge tom="info">Importado do Ploomes</Badge>` — o escape para rótulo que NÃO é
 * status de domínio (marcador de origem, contagem). Não aceita chave: quem tem estado
 * de negócio novo acrescenta ao vocabulário, e é assim que a lista continua fechada.
 */

interface PropsComuns {
  readonly semPonto?: boolean
  readonly className?: string
  readonly title?: string
}

interface PropsComStatus extends PropsComuns {
  readonly status: ChaveDeStatus
  readonly tom?: never
  readonly children?: never
}

interface PropsComTom extends PropsComuns {
  readonly status?: never
  readonly tom: TomDeStatus
  readonly children: ReactNode
}

export type PropsBadge = PropsComStatus | PropsComTom

function Selo({
  tom,
  semPonto,
  className,
  title,
  children,
}: PropsComuns & { readonly tom: TomDeStatus; readonly children: ReactNode }) {
  return (
    <span
      className={cn('ie-badge', `ie-badge--${tom}`, semPonto && 'ie-badge--sem-ponto', className)}
      {...(title === undefined ? {} : { title })}
    >
      {children}
    </span>
  )
}

export function Badge(props: PropsBadge) {
  const comuns: PropsComuns = {
    semPonto: props.semPonto,
    className: props.className,
    title: props.title,
  }

  if (props.status !== undefined) {
    return (
      <Selo {...comuns} tom={tomDoStatus(props.status)}>
        {rotuloDoStatus(props.status)}
      </Selo>
    )
  }

  return (
    <Selo {...comuns} tom={props.tom}>
      {props.children}
    </Selo>
  )
}
