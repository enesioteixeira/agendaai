'use client'

import { useCallback, useSyncExternalStore } from 'react'

export type Tema = 'claro' | 'escuro'

export const CHAVE_TEMA = 'mensvra:tema'

/**
 * Roda antes da primeira pintura, no `<head>`: sem isso o app pisca branco até
 * o React montar e aplicar a classe.
 *
 * O ESCURO É O PADRÃO, e não a preferência do sistema operacional. A identidade do
 * Mensvra Channel é o navy profundo com azul elétrico e roxo — é assim que o produto se
 * apresenta em toda a comunicação, e entrar num tema claro por causa de um ajuste do
 * Windows faria o primeiro contato com o sistema não parecer o mesmo produto. Quem
 * prefere o claro troca no topo, e a escolha fica gravada: a partir daí é ELA que manda,
 * porque a chave existir no storage já significa "esta pessoa decidiu".
 *
 * O `catch` vazio é deliberado: em modo privativo o `localStorage` levanta, e o preço de
 * não conseguir ler a preferência é abrir no escuro — nunca uma tela em branco.
 */
export const SCRIPT_DE_TEMA = `(function(){try{var t=localStorage.getItem('${CHAVE_TEMA}');if(t!=='claro'){document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`

const ouvintes = new Set<() => void>()

function inscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => {
    ouvintes.delete(ouvinte)
  }
}

/**
 * A fonte da verdade é a classe no `<html>`, escrita pelo script acima antes do
 * React existir. Ler por `useSyncExternalStore` evita divergir do que já está
 * pintado na tela — um `useState` inicial no servidor erraria metade das vezes.
 */
function lerTema(): Tema {
  return document.documentElement.classList.contains('dark') ? 'escuro' : 'claro'
}

/**
 * O servidor não tem `localStorage` nem `<html class>`, então ele responde o PADRÃO — o
 * mesmo que o script do `<head>` aplica. Responder 'claro' aqui trocaria o ícone do
 * alternador entre o HTML servido e o primeiro render do cliente em toda visita que não
 * escolheu tema, que é a maioria.
 */
function lerTemaNoServidor(): Tema {
  return 'escuro'
}

export function useTema(): [Tema, () => void] {
  const tema = useSyncExternalStore(inscrever, lerTema, lerTemaNoServidor)

  const alternar = useCallback(() => {
    const proximo: Tema = lerTema() === 'escuro' ? 'claro' : 'escuro'
    document.documentElement.classList.toggle('dark', proximo === 'escuro')
    try {
      window.localStorage.setItem(CHAVE_TEMA, proximo)
    } catch {
      /* tema é preferência: sem storage, vale só nesta sessão */
    }
    for (const ouvinte of ouvintes) ouvinte()
  }, [])

  return [tema, alternar]
}
