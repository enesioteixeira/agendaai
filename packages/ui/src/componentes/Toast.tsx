'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { cn } from '../base/cn'
import { Icone, type NomeDeIcone } from '../base/icones'

/**
 * Aviso efêmero. Nunca use para erro que exige decisão — toast some sozinho, e o que
 * some sozinho não pode carregar informação que o usuário precisa reler (número do
 * documento gerado, motivo da recusa). Para isso existem `EstadoDeErro` e `Modal`.
 *
 * `role="status"` e `aria-live="polite"` fazem o leitor de tela anunciar sem
 * interromper o que estiver sendo lido — um `alert` a cada salvamento é ruído que leva
 * o usuário a desligar o leitor.
 */

export type TomDeToast = 'acento' | 'sucesso' | 'perigo' | 'atencao' | 'info'

export interface OpcoesDeToast {
  readonly tom?: TomDeToast
  readonly detalhe?: string
  readonly icone?: NomeDeIcone
  /** 0 mantém na tela até o usuário fechar. */
  readonly duracaoMs?: number
}

interface ToastVivo extends OpcoesDeToast {
  readonly id: number
  readonly texto: string
}

interface ApiDeToast {
  mostrar: (texto: string, opcoes?: OpcoesDeToast) => number
  fechar: (id: number) => void
}

const Contexto = createContext<ApiDeToast | null>(null)

const DURACAO_PADRAO = 4000

export function ProvedorDeToast({ children }: { readonly children: ReactNode }) {
  const [toasts, definirToasts] = useState<readonly ToastVivo[]>([])
  const sequencia = useRef(0)
  const relogios = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const fechar = useCallback((id: number) => {
    const relogio = relogios.current.get(id)
    if (relogio) {
      clearTimeout(relogio)
      relogios.current.delete(id)
    }
    definirToasts((atuais) => atuais.filter((toast) => toast.id !== id))
  }, [])

  const mostrar = useCallback(
    (texto: string, opcoes: OpcoesDeToast = {}) => {
      sequencia.current += 1
      const id = sequencia.current
      definirToasts((atuais) => [...atuais, { ...opcoes, id, texto }])

      const duracao = opcoes.duracaoMs ?? DURACAO_PADRAO
      if (duracao > 0) {
        relogios.current.set(
          id,
          setTimeout(() => fechar(id), duracao),
        )
      }
      return id
    },
    [fechar],
  )

  const relogiosAtivos = relogios.current
  useEffect(
    () => () => {
      for (const relogio of relogiosAtivos.values()) clearTimeout(relogio)
      relogiosAtivos.clear()
    },
    [relogiosAtivos],
  )

  const api = useMemo<ApiDeToast>(() => ({ mostrar, fechar }), [mostrar, fechar])

  return (
    <Contexto.Provider value={api}>
      {children}
      <div className="ie-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn('ie-toast', toast.tom && `ie-toast--${toast.tom}`)}
            onClick={() => fechar(toast.id)}
          >
            {toast.icone ? <Icone nome={toast.icone} /> : null}
            <div className="ie-toast__texto">
              <div>{toast.texto}</div>
              {toast.detalhe ? <p className="ie-toast__detalhe">{toast.detalhe}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  )
}

/**
 * Fora do provedor devolve uma API que não faz nada, em vez de estourar. Perder um
 * aviso efêmero é irritante; derrubar a tela inteira porque alguém esqueceu um provedor
 * de notificação é desproporcional.
 */
export function useToast(): ApiDeToast {
  const api = useContext(Contexto)
  return api ?? SEM_TOAST
}

const SEM_TOAST: ApiDeToast = {
  mostrar: () => 0,
  fechar: () => undefined,
}
