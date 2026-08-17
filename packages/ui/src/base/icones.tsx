import type { ComponentType, SVGProps } from 'react'

/**
 * Ícones do chassi.
 *
 * O pacote tem os SEUS porque não pode importar de `apps/web` — a dependência correta
 * é a inversa, e um chassi que dependesse do app deixaria de ser reusável no primeiro
 * app novo. Repetir aqui alguns traçados do shell é duplicação assumida e barata:
 * ícone é constante desenhada, não regra que possa divergir em silêncio.
 *
 * Toda cor vem de `currentColor` e o tamanho de `1em`: o ícone herda a cor e o corpo
 * de texto de quem o hospeda, o que faz tema claro e escuro funcionarem sem uma linha
 * de condicional.
 */

type PropsIcone = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: PropsIcone) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width="1em"
      height="1em"
      {...props}
    >
      {children}
    </svg>
  )
}

const ICONES = {
  predio: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M4 21V5.5L12 3l8 2.5V21" />
      <path d="M2.5 21h19" />
      <path d="M9 9h2M13 9h2M9 13h2M13 13h2" />
      <path d="M10 21v-4h4v4" />
    </Svg>
  ),
  loja: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M3.5 9.5 5 4h14l1.5 5.5" />
      <path d="M3.5 9.5a2.5 2.5 0 0 0 4.5 1.6 2.5 2.5 0 0 0 4 0 2.5 2.5 0 0 0 4 0 2.5 2.5 0 0 0 4.5-1.6" />
      <path d="M5 12.5V20h14v-7.5" />
      <path d="M10 20v-4.5h4V20" />
    </Svg>
  ),
  pessoas: (p: PropsIcone) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 19.5c.6-3.2 3.1-5 6.2-5s5.6 1.8 6.2 5" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6" />
      <path d="M17.4 14.8c2 .6 3.4 2.2 3.8 4.7" />
    </Svg>
  ),
  pessoa: (p: PropsIcone) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c.7-3.5 3.5-5.5 7-5.5s6.3 2 7 5.5" />
    </Svg>
  ),
  caixa: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9L12 3Z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </Svg>
  ),
  armazem: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M3 21V9l9-5 9 5v12" />
      <path d="M7 21v-7h10v7" />
      <path d="M7 17.5h10" />
    </Svg>
  ),
  carrinho: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M2.5 4h2.2l2.3 10.5h10.4L20 7H6.2" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </Svg>
  ),
  nota: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M6 2.5h8l4.5 4.5v14.5H6Z" />
      <path d="M14 2.5V7h4.5" />
      <path d="M9 12h6M9 15.5h6M9 8.5h2" />
    </Svg>
  ),
  dinheiro: (p: PropsIcone) => (
    <Svg {...p}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 12h.01M18 12h.01" />
    </Svg>
  ),
  balanca: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M12 4v16M7 20h10" />
      <path d="M4 8h16M12 6l-8 2 8-2 8 2" />
      <path d="M1.5 14a2.5 2.5 0 0 0 5 0L4 8Z" />
      <path d="M17.5 14a2.5 2.5 0 0 0 5 0L20 8Z" />
    </Svg>
  ),
  camadas: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
      <path d="m3 12.5 9 4.5 9-4.5" />
      <path d="m3 17 9 4.5L21 17" />
    </Svg>
  ),
  escudo: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M12 3 5 5.5v6c0 4.3 3 8 7 9.5 4-1.5 7-5.2 7-9.5v-6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  etiqueta: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M3.5 11.5V4h7.5l9 9-7.5 7.5-9-9Z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </Svg>
  ),
  pizza: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" />
      <path d="M14.5 2.5A8 8 0 0 1 21.5 9.5h-7Z" />
    </Svg>
  ),
  cubo: (p: PropsIcone) => (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M9 9h6v6H9Z" />
    </Svg>
  ),
  busca: (p: PropsIcone) => (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.8-4.8" />
    </Svg>
  ),
  fechar: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  externo: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7.5A1.5 1.5 0 0 1 5 6h4.5" />
    </Svg>
  ),
  chevronDir: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  ),
  chevronBaixo: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="m5 9 7 7 7-7" />
    </Svg>
  ),
  alerta: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4.5M12 17.5h.01" />
    </Svg>
  ),
  info: (p: PropsIcone) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8h.01" />
    </Svg>
  ),
  check: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Svg>
  ),
  filtro: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
    </Svg>
  ),
  atualizar: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M20 11a8 8 0 1 0-2 6.2" />
      <path d="M20 4v6h-6" />
    </Svg>
  ),
  fabrica: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M3 21V10l5 3.5V10l5 3.5V10l5 3.5V21Z" />
      <path d="M18 10V4h3v6" />
    </Svg>
  ),

  /* ── vocabulário do atendimento ──────────────────────────────────────────
     Os traçados acima vieram do chassi do ERP e falam de estoque, nota e
     fábrica. Um produto de conversa precisa do seu próprio vocabulário: os
     ícones abaixo nasceram aqui. Mesma grade de 24, mesma espessura de traço e
     mesmo `currentColor` — um ícone que destoa da grade aparece como se fosse
     de outro tamanho mesmo tendo o mesmo `font-size`. */

  conversa: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M21 12a8 8 0 0 1-8 8H8l-4 3v-4.5A8 8 0 0 1 13 4a8 8 0 0 1 8 8Z" />
    </Svg>
  ),
  agente: (p: PropsIcone) => (
    <Svg {...p}>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 8V4.5M9.5 13h.01M14.5 13h.01" />
      <path d="M9 16.5h6" />
    </Svg>
  ),
  antena: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M8.5 15a5 5 0 0 1 0-7M15.5 8a5 5 0 0 1 0 7" />
      <path d="M5.8 17.8a9 9 0 0 1 0-12.6M18.2 5.2a9 9 0 0 1 0 12.6" />
    </Svg>
  ),
  livro: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5Z" />
    </Svg>
  ),
  plugue: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M9 3v6M15 3v6" />
      <path d="M6 9h12v3a6 6 0 0 1-12 0V9Z" />
      <path d="M12 18v3" />
    </Svg>
  ),
  engrenagem: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="m19.4 14-.5 1.2 1.3 2-1.9 1.9-2-1.3-1.2.5-.6 2.3h-2.7l-.6-2.3-1.2-.5-2 1.3L6 17.2l1.3-2-.5-1.2-2.3-.6v-2.7l2.3-.6.5-1.2-1.3-2L7.9 4.9l2 1.3 1.2-.5.6-2.3h2.7l.6 2.3 1.2.5 2-1.3 1.9 1.9-1.3 2 .5 1.2 2.3.6v2.7l-2.3.6Z" />
    </Svg>
  ),
  chave: (p: PropsIcone) => (
    <Svg {...p}>
      <path d="M15.5 3a5.5 5.5 0 1 0-4.9 8L9 12.6V15H6.5v2.5H4V20h3.4l6-6a5.5 5.5 0 0 0 2.1.5Z" />
      <path d="M16.5 7.5h.01" />
    </Svg>
  ),
  calendario: (p: PropsIcone) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  ),
} satisfies Record<string, ComponentType<PropsIcone>>

export type NomeDeIcone = keyof typeof ICONES

export const NOMES_DE_ICONE = Object.keys(ICONES) as readonly NomeDeIcone[]

export function ehNomeDeIcone(valor: unknown): valor is NomeDeIcone {
  return typeof valor === 'string' && Object.hasOwn(ICONES, valor)
}

export function Icone({ nome, ...props }: { nome: NomeDeIcone } & PropsIcone) {
  const Componente = ICONES[nome]
  return <Componente {...props} />
}
