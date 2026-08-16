'use client'

import { useTema } from '@/componentes/tema'

/**
 * O botão diz o que ACONTECE ao clicar, não o estado atual — "Tema claro" quando
 * está escuro. Rótulo de estado num botão é a fonte clássica de confusão: metade
 * das pessoas lê "Escuro" como "estou no escuro" e a outra metade como "vou para
 * o escuro", e as duas leituras são defensáveis.
 */
export function AlternadorDeTema() {
  const [tema, alternar] = useTema()
  const vaiPara = tema === 'escuro' ? 'claro' : 'escuro'

  return (
    <button
      type="button"
      onClick={alternar}
      className="flex w-full items-center gap-2 rounded-2 px-2.5 py-1.5 text-[13px] text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
    >
      <span aria-hidden>{tema === 'escuro' ? '☀' : '☾'}</span>
      <span>Tema {vaiPara}</span>
    </button>
  )
}
