'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '../base/cn'
import { Icone } from '../base/icones'

export interface PropsBuscaLocal {
  readonly valor: string
  readonly aoTrocar: (valor: string) => void
  readonly placeholder?: string
  readonly rotulo?: string
  /** Espera entre a última tecla e a troca efetiva. 0 desliga. */
  readonly atrasoMs?: number
  readonly className?: string
}

/**
 * Campo de busca com atraso.
 *
 * O atraso não é economia de rede: é o que impede a lista de piscar a cada tecla. Sem
 * ele, "metalúrgica" dispara onze consultas, dez delas jogadas fora, e cada uma
 * remonta o grid inteiro — o cursor do usuário perde a posição e a tela treme.
 *
 * O estado digitado é local e o valor confirmado é do chamador. Manter os dois é o que
 * permite escrever sem travar E refletir mudança vinda de fora (limpar filtros,
 * restaurar aba).
 */
export function BuscaLocal({
  valor,
  aoTrocar,
  placeholder = 'Buscar…',
  rotulo = 'Buscar na lista',
  atrasoMs = 250,
  className,
}: PropsBuscaLocal) {
  const [digitado, definirDigitado] = useState(valor)

  /**
   * `aoTrocar` vive num ref, e não na lista de dependências: quase toda tela passa uma
   * função nova a cada render, e depender dela reiniciaria o temporizador sem o usuário
   * ter digitado nada — o efeito seria uma busca que nunca dispara enquanto a tela
   * estiver renderizando por outro motivo.
   */
  const notificar = useRef(aoTrocar)
  useEffect(() => {
    notificar.current = aoTrocar
  })

  useEffect(() => {
    definirDigitado(valor)
  }, [valor])

  useEffect(() => {
    if (digitado === valor) return
    if (atrasoMs <= 0) {
      notificar.current(digitado)
      return
    }
    const relogio = setTimeout(() => notificar.current(digitado), atrasoMs)
    return () => clearTimeout(relogio)
  }, [digitado, valor, atrasoMs])

  return (
    <div className={cn('ie-busca', className)}>
      <Icone nome="busca" className="ie-busca__icone" />
      <input
        className="ie-entrada"
        type="search"
        value={digitado}
        placeholder={placeholder}
        aria-label={rotulo}
        onChange={(evento) => definirDigitado(evento.target.value)}
      />
    </div>
  )
}
