'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '../base/cn'
import { Botao } from './Botao'

/**
 * Diálogo modal.
 *
 * Três coisas que parecem detalhe e são o que separa um modal utilizável de um que
 * prende o usuário:
 *
 * 1. Esc fecha. É a primeira tecla que todo operador de ERP aperta.
 * 2. O foco entra no diálogo ao abrir e VOLTA para quem o abriu ao fechar. Sem isso,
 *    quem navega por teclado é devolvido ao topo da página a cada confirmação.
 * 3. O fundo escuro fecha, mas só quando o clique COMEÇOU nele — arrastar uma seleção
 *    de dentro para fora não pode descartar um formulário meio preenchido.
 */

export type TamanhoDeModal = 'padrao' | 'g' | 'gg'

export interface PropsModal {
  readonly aberto: boolean
  readonly titulo: string
  readonly subtitulo?: string
  readonly children: ReactNode
  readonly acoes?: ReactNode
  readonly tamanho?: TamanhoDeModal
  readonly aoFechar: () => void
  /** Impede fechar por Esc e por clique no fundo. Use em operação em andamento. */
  readonly travado?: boolean
}

export function Modal({
  aberto,
  titulo,
  subtitulo,
  children,
  acoes,
  tamanho = 'padrao',
  aoFechar,
  travado = false,
}: PropsModal) {
  const [montado, definirMontado] = useState(false)
  const dialogo = useRef<HTMLDivElement | null>(null)
  const focoAnterior = useRef<Element | null>(null)
  const comecouNoFundo = useRef(false)

  useEffect(() => definirMontado(true), [])

  useEffect(() => {
    if (!aberto) return
    focoAnterior.current = document.activeElement
    dialogo.current?.focus()

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape' || travado) return
      evento.stopPropagation()
      aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)

    return () => {
      document.removeEventListener('keydown', aoTeclar)
      const anterior = focoAnterior.current
      if (anterior instanceof HTMLElement) anterior.focus()
    }
  }, [aberto, travado, aoFechar])

  if (!aberto || !montado) return null

  return createPortal(
    <div
      className="ie-modal__fundo"
      onMouseDown={(evento) => {
        comecouNoFundo.current = evento.target === evento.currentTarget
      }}
      onMouseUp={(evento) => {
        if (travado) return
        if (!comecouNoFundo.current) return
        if (evento.target !== evento.currentTarget) return
        aoFechar()
      }}
    >
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={cn('ie-modal', tamanho !== 'padrao' && `ie-modal--${tamanho}`)}
      >
        <header className="ie-modal__cab">
          <div>
            <h2 className="ie-modal__titulo">{titulo}</h2>
            {subtitulo ? <p className="ie-modal__sub">{subtitulo}</p> : null}
          </div>
          <Botao
            variante="fantasma"
            icone="fechar"
            aria-label="Fechar"
            onClick={aoFechar}
            disabled={travado}
          />
        </header>

        <div className="ie-modal__corpo">{children}</div>

        {acoes ? <footer className="ie-modal__acoes">{acoes}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}

export interface PropsConfirmar {
  readonly aberto: boolean
  readonly titulo: string
  readonly texto: ReactNode
  readonly rotuloConfirmar?: string
  readonly rotuloCancelar?: string
  readonly variante?: 'primario' | 'perigo'
  readonly aoConfirmar: () => void
  readonly aoCancelar: () => void
  readonly ocupado?: boolean
}

/**
 * Confirmação. O rótulo do botão diz o VERBO da ação ("Cancelar pedido"), nunca "OK":
 * numa tela onde o botão de sair também se chama "Cancelar", "Cancelar / OK" produz a
 * confirmação errada com frequência alta o bastante para virar chamado.
 */
export function Confirmar({
  aberto,
  titulo,
  texto,
  rotuloConfirmar = 'Confirmar',
  rotuloCancelar = 'Voltar',
  variante = 'primario',
  aoConfirmar,
  aoCancelar,
  ocupado = false,
}: PropsConfirmar) {
  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      aoFechar={aoCancelar}
      travado={ocupado}
      acoes={
        <>
          <Botao onClick={aoCancelar} disabled={ocupado}>
            {rotuloCancelar}
          </Botao>
          <Botao variante={variante} onClick={aoConfirmar} disabled={ocupado}>
            {rotuloConfirmar}
          </Botao>
        </>
      }
    >
      {texto}
    </Modal>
  )
}
