import { TRACO } from './numero'

/**
 * DATAS EM pt-BR, com a armadilha do fuso resolvida na entrada.
 *
 * `new Date('2026-08-09')` é interpretado como MEIA-NOITE UTC pela especificação; em
 * qualquer fuso a oeste de Greenwich — inclusive os quatro do Brasil — imprimi-lo com
 * `getDate()` devolve o dia 8. É o bug clássico de "a data do documento aparece um dia
 * antes", e ele só se manifesta para quem está no fuso certo, o que faz o defeito
 * atravessar a revisão inteira.
 *
 * A regra aqui: texto SEM fuso declarado é lido literalmente, campo a campo, e nunca
 * passa por `Date`. Texto COM fuso (`Z`, `+03:00`) é instante de verdade e é convertido
 * para o horário local, que é o que o usuário quer ver num carimbo de auditoria.
 */

export type EntradaDeData = string | Date | null | undefined

export interface PartesDeData {
  readonly ano: number
  readonly mes: number
  readonly dia: number
  readonly hora: number
  readonly minuto: number
  readonly segundo: number
  /** O texto de origem trazia hora? Define se `formatarDataHora` tem o que imprimir. */
  readonly temHora: boolean
}

const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/
const DATA_E_HORA = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
const COM_FUSO = /(?:Z|[+-]\d{2}:?\d{2})$/i

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

function deData(data: Date, temHora: boolean): PartesDeData | null {
  if (Number.isNaN(data.getTime())) return null
  return {
    ano: data.getFullYear(),
    mes: data.getMonth() + 1,
    dia: data.getDate(),
    hora: data.getHours(),
    minuto: data.getMinutes(),
    segundo: data.getSeconds(),
    temHora,
  }
}

/** Decompõe a entrada sem nunca deslocar o dia. Devolve `null` para lixo. */
export function lerData(valor: EntradaDeData): PartesDeData | null {
  if (valor === null || valor === undefined) return null
  if (valor instanceof Date) return deData(valor, true)

  const texto = valor.trim()
  if (texto === '') return null

  const soData = SO_DATA.exec(texto)
  if (soData) {
    const [, ano = '', mes = '', dia = ''] = soData
    return {
      ano: Number(ano),
      mes: Number(mes),
      dia: Number(dia),
      hora: 0,
      minuto: 0,
      segundo: 0,
      temHora: false,
    }
  }

  if (COM_FUSO.test(texto)) return deData(new Date(texto), true)

  const comHora = DATA_E_HORA.exec(texto)
  if (comHora) {
    const [, ano = '', mes = '', dia = '', hora = '', minuto = '', segundo = '0'] = comHora
    return {
      ano: Number(ano),
      mes: Number(mes),
      dia: Number(dia),
      hora: Number(hora),
      minuto: Number(minuto),
      segundo: Number(segundo),
      temHora: true,
    }
  }

  return deData(new Date(texto), true)
}

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, '0')
}

/** `09/08/2026`. */
export function formatarData(valor: EntradaDeData): string {
  const p = lerData(valor)
  if (!p) return TRACO
  return `${doisDigitos(p.dia)}/${doisDigitos(p.mes)}/${p.ano}`
}

/** `09/08/26` — para coluna estreita de grid. */
export function formatarDataCurta(valor: EntradaDeData): string {
  const p = lerData(valor)
  if (!p) return TRACO
  return `${doisDigitos(p.dia)}/${doisDigitos(p.mes)}/${String(p.ano).slice(-2)}`
}

/** `14:35`. */
export function formatarHora(valor: EntradaDeData): string {
  const p = lerData(valor)
  if (!p) return TRACO
  return `${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}`
}

/**
 * `09/08/2026 14:35`. Quando a entrada não trazia hora, devolve só a data — imprimir
 * `00:00` inventaria uma precisão que o dado não tem, e num carimbo de auditoria isso
 * é afirmação falsa.
 */
export function formatarDataHora(valor: EntradaDeData): string {
  const p = lerData(valor)
  if (!p) return TRACO
  if (!p.temHora) return formatarData(valor)
  return `${formatarData(valor)} ${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}`
}

/** `9 de agosto de 2026`. */
export function formatarDataExtenso(valor: EntradaDeData): string {
  const p = lerData(valor)
  if (!p) return TRACO
  return `${p.dia} de ${MESES[p.mes - 1] ?? ''} de ${p.ano}`
}

function emUtc(p: PartesDeData): number {
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo)
}

function meiaNoiteUtc(p: PartesDeData): number {
  return Date.UTC(p.ano, p.mes - 1, p.dia)
}

const DIA_MS = 86_400_000

/**
 * Diferença em dias de CALENDÁRIO (não em blocos de 24 h): ontem 23h e hoje 1h são
 * um dia de diferença, e não zero. É como o usuário conta prazo de vencimento.
 * Negativo é passado.
 */
export function diferencaEmDias(valor: EntradaDeData, agora: EntradaDeData = new Date()): number | null {
  const alvo = lerData(valor)
  const base = lerData(agora)
  if (!alvo || !base) return null
  return Math.round((meiaNoiteUtc(alvo) - meiaNoiteUtc(base)) / DIA_MS)
}

/**
 * `agora`, `há 5 min`, `há 2 h`, `ontem`, `há 3 dias`, `em 2 meses`.
 *
 * `agora` é parâmetro, e não `new Date()` escondido dentro: relógio implícito é a
 * razão pela qual teste de tempo relativo passa hoje e falha na virada do mês.
 */
export function formatarRelativo(valor: EntradaDeData, agora: EntradaDeData = new Date()): string {
  const alvo = lerData(valor)
  const base = lerData(agora)
  if (!alvo || !base) return TRACO

  const dias = Math.round((meiaNoiteUtc(alvo) - meiaNoiteUtc(base)) / DIA_MS)
  const segundos = Math.round((emUtc(alvo) - emUtc(base)) / 1000)
  const passado = segundos < 0
  const absSegundos = Math.abs(segundos)

  if (alvo.temHora && base.temHora && absSegundos < 45) return 'agora'

  if (dias === 0 && alvo.temHora && base.temHora) {
    const minutos = Math.round(absSegundos / 60)
    if (minutos < 60) return passado ? `há ${minutos} min` : `em ${minutos} min`
    const horas = Math.round(minutos / 60)
    return passado ? `há ${horas} h` : `em ${horas} h`
  }

  if (dias === 0) return 'hoje'
  if (dias === -1) return 'ontem'
  if (dias === 1) return 'amanhã'

  const absDias = Math.abs(dias)
  if (absDias < 30) return passado ? `há ${absDias} dias` : `em ${absDias} dias`

  const meses = Math.round(absDias / 30)
  if (absDias < 365) {
    const texto = meses === 1 ? '1 mês' : `${meses} meses`
    return passado ? `há ${texto}` : `em ${texto}`
  }

  const anos = Math.round(absDias / 365)
  const texto = anos === 1 ? '1 ano' : `${anos} anos`
  return passado ? `há ${texto}` : `em ${texto}`
}
