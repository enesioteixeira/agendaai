'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Icone, cn, type NomeDeIcone } from '@atende/ui'

/**
 * A navegação do painel. Cliente por um motivo só: marcar o item ATIVO exige
 * conhecer a rota corrente, e `usePathname` é hook. O resto do shell (que lê a
 * sessão e decide o tenant) continua sendo servidor — ver `(painel)/layout.tsx`.
 */

export interface ItemDeNavegacao {
  readonly href: string
  readonly rotulo: string
  readonly icone: NomeDeIcone
  /** Módulo entregue? Um item desligado aparece esmaecido e não navega. */
  readonly ativo?: boolean
  /** Aviso curto ao lado do rótulo (ex.: "em breve"). */
  readonly selo?: string
}

export interface GrupoDeNavegacao {
  readonly titulo: string
  readonly itens: readonly ItemDeNavegacao[]
}

export function NavLateral({ grupos }: { readonly grupos: readonly GrupoDeNavegacao[] }) {
  const rota = usePathname()

  return (
    <nav className="flex flex-col gap-5" aria-label="Seções do painel">
      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="flex flex-col gap-1">
          <h2 className="px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-texto-fraco">
            {grupo.titulo}
          </h2>
          {grupo.itens.map((item) => (
            <ItemLink key={item.href} item={item} rota={rota} />
          ))}
        </div>
      ))}
    </nav>
  )
}

function ItemLink({ item, rota }: { readonly item: ItemDeNavegacao; readonly rota: string }) {
  const conteudo = (
    <>
      <Icone nome={item.icone} aria-hidden />
      <span className="flex-1 truncate">{item.rotulo}</span>
      {item.selo ? (
        <span className="rounded-cheio bg-superficie-3 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-texto-fraco">
          {item.selo}
        </span>
      ) : null}
    </>
  )

  const base =
    'flex items-center gap-2 rounded-2 px-2 py-1.5 text-[13px] transition-colors'

  if (item.ativo === false) {
    return (
      // Sem `<a>`: item que não navega não pode ser link — o leitor de tela
      // anunciaria um destino que não existe, e o Tab pararia num alvo inerte.
      <span className={cn(base, 'cursor-default text-texto-fraco opacity-60')} aria-disabled>
        {conteudo}
      </span>
    )
  }

  // `/agenda` casa com `/agenda/servicos`, mas `/` só casa com ele mesmo — senão
  // a raiz ficaria acesa em toda rota do painel.
  const selecionado = rota === item.href || (item.href !== '/' && rota.startsWith(`${item.href}/`))

  return (
    <Link
      href={item.href}
      aria-current={selecionado ? 'page' : undefined}
      className={cn(
        base,
        selecionado
          ? 'bg-acento-fraco font-semibold text-acento'
          : 'text-texto-suave hover:bg-superficie-2 hover:text-texto',
      )}
    >
      {conteudo}
    </Link>
  )
}
