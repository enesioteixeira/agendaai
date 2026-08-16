'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '../base/cn'
import { Icone, type NomeDeIcone } from '../base/icones'

export type VarianteDeBotao = 'padrao' | 'primario' | 'perigo' | 'fantasma'

export interface PropsBotao extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly variante?: VarianteDeBotao
  readonly icone?: NomeDeIcone
  readonly children?: ReactNode
}

/**
 * `type="button"` é o padrão de propósito: dentro de um `<form>`, o padrão do HTML é
 * `submit`, e um botão "Filtrar" que envia o formulário e recarrega a página é o bug
 * mais chato de diagnosticar de toda a categoria.
 */
export function Botao({
  variante = 'padrao',
  icone,
  children,
  className,
  type = 'button',
  ...resto
}: PropsBotao) {
  return (
    <button
      type={type}
      className={cn('ie-botao', variante !== 'padrao' && `ie-botao--${variante}`, className)}
      {...resto}
    >
      {icone ? <Icone nome={icone} /> : null}
      {children}
    </button>
  )
}
