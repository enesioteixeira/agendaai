// Os filtros da inbox: leitura da URL, montagem de link e tradução para o
// `FiltroInbox` de `@atende/db`.
//
// POR QUE ISTO É URL, E NÃO ESTADO DE COMPONENTE. Um supervisor manda "olha a
// fila do Financeiro estourando" colando um link, e o operador que recarrega a
// página no meio do turno não pode voltar para "todas as conversas". Filtro em
// `useState` não sobrevive a nenhuma das duas coisas. Como consequência, esta
// camada é toda de funções puras sobre `searchParams` — e o componente que a
// desenha é um servidor com `<a href>`, sem JavaScript e sem hidratar nada.
//
// POR QUE OS SCHEMAS ZOD ESTÃO AQUI E NÃO EM `@atende/core`. Mesmo raciocínio
// escrito em `modules/atendimento/schemas.ts`: a regra 14 manda para o core o que
// é CONTRATO entre `apps/web` e `apps/worker`. Isto é a forma de uma query string
// do painel — "parâmetro repetido chega como array", "valor desconhecido é
// filtro desligado" é assunto de HTTP, não de domínio. O que é domínio é
// reusado do core sem cópia: `situacaoPrazoSchema` é o MESMO enum que
// `situacaoDoPrazo` devolve, e é o que impede a tela oferecer uma situação que o
// núcleo não conhece.
//
// A borda existe de verdade: `?fila=` é input do cliente. Ele nunca vira
// identidade de tenant (regra inviolável 3) — é só um `where` a mais dentro do
// `runWithTenant`, e a extension de tenancy já garante que id de outra empresa
// não casa com nada. Mesmo assim `lerFiltros` recebe as filas do tenant e
// DESCARTA o id que não está entre elas: filtro pendurado num id alheio
// mostraria "nenhuma conversa" como se a fila estivesse vazia.

import { situacaoPrazoSchema, type SituacaoPrazo } from '@atende/core'
import { z } from 'zod'

import type { EstadoConversa } from './vocabulario'

/** Quem é o dono da conversa, do ponto de vista de quem está olhando. */
export const DONOS = ['todas', 'minhas', 'sem_dono'] as const
export type Dono = (typeof DONOS)[number]

const estadoSchema = z.enum(['bot_arvore', 'bot_ia', 'fila_humano', 'humano', 'encerrada'])

/**
 * Catraca de tipo: acrescentar um valor ao enum `EstadoConversa` do schema sem
 * acrescentá-lo aqui vira erro de compilação, e não um estado que existe no
 * banco e some do filtro sem ninguém notar. É a mesma escolha do `Record`
 * completo de `vocabulario.ts`.
 */
export const ESTADOS_FILTRAVEIS: readonly EstadoConversa[] = estadoSchema.options

const donoSchema = z.enum(DONOS)

/**
 * Um parâmetro de query pode chegar repetido (`?prazo=a&prazo=b`), e aí o Next
 * entrega um array. Ficamos com o PRIMEIRO em vez de recusar: filtro é
 * navegação, não formulário — recusar devolveria erro para um link que a pessoa
 * só quer abrir.
 */
const parametro = z
  .union([z.string(), z.array(z.string()), z.undefined()])
  .transform((v) => (Array.isArray(v) ? (v[0] ?? '') : (v ?? '')))

/**
 * Valor desconhecido vira "desligado", nunca erro. Link antigo, filtro removido
 * do produto ou id colado errado abrem a inbox sem filtro — que é o pior caso
 * aceitável — em vez de uma tela de erro no meio do turno.
 */
function opcional<T extends string>(schema: z.ZodType<T>) {
  return parametro.transform((v) => {
    const lido = schema.safeParse(v)
    return lido.success ? lido.data : null
  })
}

export const filtrosSchema = z.object({
  fila: parametro.transform((v) => (v.length === 0 ? null : v)),
  estado: opcional(estadoSchema),
  prazo: opcional(situacaoPrazoSchema),
  de: parametro.transform((v) => {
    const lido = donoSchema.safeParse(v)
    return lido.success ? lido.data : ('todas' as Dono)
  }),
})

export interface FiltrosDaInbox {
  readonly fila: string | null
  readonly estado: EstadoConversa | null
  readonly prazo: SituacaoPrazo | null
  readonly de: Dono
}

/** O que a URL diz, depois de podado ao que existe neste tenant. */
export function lerFiltros(
  params: Record<string, string | string[] | undefined>,
  filasDoTenant: readonly { readonly id: string }[],
): FiltrosDaInbox {
  const lido = filtrosSchema.parse({
    fila: params['fila'],
    estado: params['estado'],
    prazo: params['prazo'],
    de: params['de'],
  })

  const filaConhecida = lido.fila !== null && filasDoTenant.some((f) => f.id === lido.fila)
  return { ...lido, fila: filaConhecida ? lido.fila : null }
}

/**
 * Traduz para o `FiltroInbox` de `@atende/db`.
 *
 * `de` some do resultado quando é "todas": em `FiltroInbox`, `atendenteUsuarioId`
 * AUSENTE é "tanto faz" e `null` é "sem dono" — passar `null` no lugar de omitir
 * esconderia toda conversa já assumida.
 */
export function filtroDeConsulta(
  filtros: FiltrosDaInbox,
  usuarioId: string,
): {
  filaId?: string
  estado?: EstadoConversa
  atendenteUsuarioId?: string | null
  situacaoPrazo?: SituacaoPrazo
} {
  return {
    ...(filtros.fila !== null ? { filaId: filtros.fila } : {}),
    ...(filtros.estado !== null ? { estado: filtros.estado } : {}),
    ...(filtros.prazo !== null ? { situacaoPrazo: filtros.prazo } : {}),
    ...(filtros.de === 'minhas'
      ? { atendenteUsuarioId: usuarioId }
      : filtros.de === 'sem_dono'
        ? { atendenteUsuarioId: null }
        : {}),
  }
}

/**
 * Query string canônica dos filtros: só o que está ligado, sempre na mesma
 * ordem. A ordem fixa importa porque é ela que faz dois caminhos até o mesmo
 * recorte gerarem a MESMA URL — e o `aria-current` da pílula comparar strings
 * em vez de objetos.
 */
export function montarQuery(filtros: FiltrosDaInbox): string {
  const q = new URLSearchParams()
  if (filtros.de !== 'todas') q.set('de', filtros.de)
  if (filtros.estado !== null) q.set('estado', filtros.estado)
  if (filtros.fila !== null) q.set('fila', filtros.fila)
  if (filtros.prazo !== null) q.set('prazo', filtros.prazo)
  const texto = q.toString()
  return texto === '' ? '' : `?${texto}`
}

/** Link para a inbox (ou para uma conversa) preservando o recorte atual. */
export function comFiltros(caminho: string, filtros: FiltrosDaInbox): string {
  return `${caminho}${montarQuery(filtros)}`
}

/**
 * Link que liga/desliga UMA dimensão e preserva as outras.
 *
 * Passar o valor que já está ligado DESLIGA o filtro. Sem isso a única saída
 * seria a pílula "Todas" — e é a mesma regra do `FiltroPilulas` do chassi, para
 * a inbox não se comportar diferente do resto do produto.
 */
export function alternar<C extends 'fila' | 'estado' | 'prazo'>(
  filtros: FiltrosDaInbox,
  campo: C,
  valor: NonNullable<FiltrosDaInbox[C]>,
): FiltrosDaInbox {
  return { ...filtros, [campo]: filtros[campo] === valor ? null : valor }
}

/** Quantos filtros além do dono estão ligados — o contador do "Mais filtros". */
export function quantosFiltrosFinos(filtros: FiltrosDaInbox): number {
  return [filtros.fila, filtros.estado, filtros.prazo].filter((v) => v !== null).length
}

export const SEM_FILTROS: FiltrosDaInbox = { fila: null, estado: null, prazo: null, de: 'todas' }
