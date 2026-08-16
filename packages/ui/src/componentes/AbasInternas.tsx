'use client'

import { useId, useState, type ReactNode } from 'react'

import { cn } from '../base/cn'
import { Icone, type NomeDeIcone } from '../base/icones'
import { formatarNumero } from '../formato/numero'

/**
 * As abas DENTRO da tela de detalhe (itens, notas, títulos, histórico). Não confundir
 * com as abas do shell: estas não abrem workspace nenhum, são seções do mesmo registro.
 *
 * O CONTADOR é obrigatório na prática, ainda que opcional no tipo: numa tela de pedido,
 * "Notas 0" e "Notas 3" respondem, sem clique, a pergunta que trouxe o usuário. Aba sem
 * contador obriga a abrir cada uma para descobrir onde está o dado.
 *
 * O conteúdo é `render`, e não `ReactNode` pronto: aba fechada não deve montar a árvore
 * nem disparar a consulta dela. Numa tela com seis abas, montar as seis de uma vez são
 * seis requisições para ver uma.
 */

export interface AbaInterna {
  readonly id: string
  readonly titulo: string
  readonly icone?: NomeDeIcone
  readonly contador?: number | null
  readonly render: () => ReactNode
}

export interface PropsAbasInternas {
  readonly abas: readonly AbaInterna[]
  /** Aba aberta na primeira renderização. Sem valor, a primeira da lista. */
  readonly inicial?: string
  /** Modo controlado, para a aba interna sobreviver ao keep-alive pelo store da aba. */
  readonly ativa?: string
  readonly aoTrocar?: (id: string) => void
  readonly className?: string
}

export function AbasInternas({ abas, inicial, ativa, aoTrocar, className }: PropsAbasInternas) {
  const prefixo = useId()
  const [interna, definirInterna] = useState(() => inicial ?? abas[0]?.id ?? '')

  const atual = ativa ?? interna
  const escolhida = abas.find((aba) => aba.id === atual) ?? abas[0]

  if (!escolhida) return null

  return (
    <div className={cn('ie-abas', className)}>
      <div className="ie-abas__tiras" role="tablist">
        {abas.map((aba) => (
          <button
            key={aba.id}
            type="button"
            role="tab"
            id={`${prefixo}-tira-${aba.id}`}
            aria-selected={aba.id === escolhida.id}
            aria-controls={`${prefixo}-painel-${aba.id}`}
            className="ie-abas__tira"
            onClick={() => {
              definirInterna(aba.id)
              aoTrocar?.(aba.id)
            }}
          >
            {aba.icone ? <Icone nome={aba.icone} /> : null}
            {aba.titulo}
            {aba.contador === null || aba.contador === undefined ? null : (
              <span className="ie-abas__contador">{formatarNumero(aba.contador)}</span>
            )}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${prefixo}-painel-${escolhida.id}`}
        aria-labelledby={`${prefixo}-tira-${escolhida.id}`}
        className="ie-abas__painel"
      >
        {escolhida.render()}
      </div>
    </div>
  )
}
