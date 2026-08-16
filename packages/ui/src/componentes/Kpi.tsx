'use client'

import type { ReactNode } from 'react'

import { cn } from '../base/cn'
import { Icone, type NomeDeIcone } from '../base/icones'

/**
 * A faixa de indicadores do topo da lista.
 *
 * `valor` chega FORMATADO. É deliberado: o KPI não sabe se aquilo é dinheiro, contagem
 * ou percentual, e adivinhar pela aparência do número é exatamente como um total em
 * centavos vira "1.234" na tela. Quem monta a tela chama `formatarMoeda`,
 * `formatarNumero` ou `formatarPercentual` e passa o texto pronto.
 *
 * KPI com `referencia`/`aoClicar` vira botão: indicador que não leva à lista que o
 * originou obriga o usuário a refazer o filtro à mão, e é a metade do drill-down que
 * costuma ser esquecida.
 */

export interface DefinicaoDeKpi {
  readonly id: string
  readonly rotulo: string
  /** Já formatado — `formatarMoeda(...)`, `formatarNumero(...)`. */
  readonly valor: ReactNode
  readonly legenda?: string
  readonly icone?: NomeDeIcone
  readonly delta?: {
    readonly texto: string
    /** A variação é boa para o negócio? Define a cor; `undefined` fica neutra. */
    readonly bom?: boolean
  }
  readonly aoClicar?: () => void
  readonly title?: string
}

export function Kpi({ rotulo, valor, legenda, icone, delta, aoClicar, title }: DefinicaoDeKpi) {
  const conteudo = (
    <>
      <span className="ie-kpi__rotulo">
        {icone ? <Icone nome={icone} /> : null} {rotulo}
      </span>
      <span className="ie-kpi__valor">{valor}</span>
      {delta ? (
        <span
          className={cn(
            'ie-kpi__delta',
            delta.bom === true && 'ie-kpi__delta--bom',
            delta.bom === false && 'ie-kpi__delta--ruim',
          )}
        >
          {delta.texto}
        </span>
      ) : null}
      {legenda ? <span className="ie-kpi__legenda">{legenda}</span> : null}
    </>
  )

  if (!aoClicar) {
    return (
      <div className="ie-kpi" {...(title === undefined ? {} : { title })}>
        {conteudo}
      </div>
    )
  }

  return (
    <button
      type="button"
      className="ie-kpi"
      onClick={aoClicar}
      {...(title === undefined ? {} : { title })}
    >
      {conteudo}
    </button>
  )
}

export function FaixaDeKpis({
  kpis,
  className,
}: {
  readonly kpis: readonly DefinicaoDeKpi[]
  readonly className?: string
}) {
  if (kpis.length === 0) return null
  return (
    <div className={cn('ie-kpis', className)}>
      {kpis.map((kpi) => (
        <Kpi key={kpi.id} {...kpi} />
      ))}
    </div>
  )
}
