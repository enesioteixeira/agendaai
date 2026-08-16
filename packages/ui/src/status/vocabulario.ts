/**
 * VOCABULÁRIO FECHADO DE STATUS.
 *
 * Um ERP tem status em quase toda tela, e cada tela é escrita por gente diferente. Sem
 * uma lista fechada, o mesmo estado ganha três nomes ("Aguardando", "Pendente de
 * aprovação", "Em aprovação") e duas cores, e a partir daí ninguém consegue mais
 * responder "quantos documentos estão parados esperando alguém?" — nem o usuário
 * olhando a tela, nem o filtro, nem o indicador.
 *
 * A trava é de compilação: {@link ChaveDeStatus} sai das chaves deste objeto, então
 * `<Badge status="aguardado" />` não compila. Chave nova entra AQUI, com rótulo e tom
 * decididos uma vez, e passa a valer para as 47 telas de uma vez.
 *
 * O TOM não é decoração — é semântica que o daltônico também precisa ler, e por isso o
 * `Badge` sempre imprime o rótulo por extenso. A cor reforça, nunca substitui.
 */

export type TomDeStatus =
  | 'neutro'
  | 'sucesso'
  | 'perigo'
  | 'atencao'
  | 'info'
  | 'acento'
  | 'roxo'

export interface DefinicaoDeStatus {
  readonly rotulo: string
  readonly tom: TomDeStatus
}

export const VOCABULARIO_DE_STATUS = {
  // ── ciclo de documento (pedido, cotação, requisição) ──────────────────
  rascunho: { rotulo: 'Rascunho', tom: 'neutro' },
  aguardando: { rotulo: 'Aguardando aprovação', tom: 'atencao' },
  emAnalise: { rotulo: 'Em análise', tom: 'atencao' },
  aprovado: { rotulo: 'Aprovado', tom: 'sucesso' },
  recusado: { rotulo: 'Recusado', tom: 'perigo' },
  parcial: { rotulo: 'Parcialmente recebido', tom: 'info' },
  recebido: { rotulo: 'Recebido', tom: 'sucesso' },
  cancelado: { rotulo: 'Cancelado', tom: 'perigo' },
  enviada: { rotulo: 'Enviada', tom: 'info' },
  respondida: { rotulo: 'Respondida', tom: 'acento' },
  concluida: { rotulo: 'Concluída', tom: 'sucesso' },

  // ── financeiro ───────────────────────────────────────────────────────
  aberto: { rotulo: 'Em aberto', tom: 'info' },
  aVencer: { rotulo: 'A vencer', tom: 'atencao' },
  vencido: { rotulo: 'Vencido', tom: 'perigo' },
  pago: { rotulo: 'Pago', tom: 'sucesso' },
  conciliado: { rotulo: 'Conciliado', tom: 'sucesso' },

  // ── fiscal ───────────────────────────────────────────────────────────
  digitacao: { rotulo: 'Em digitação', tom: 'neutro' },
  autorizada: { rotulo: 'Autorizada', tom: 'sucesso' },
  denegada: { rotulo: 'Denegada', tom: 'perigo' },
  cancelada: { rotulo: 'Cancelada', tom: 'perigo' },
  inutilizada: { rotulo: 'Inutilizada', tom: 'neutro' },

  // ── estoque e giro ───────────────────────────────────────────────────
  altoGiro: { rotulo: 'Alto giro', tom: 'sucesso' },
  giroNormal: { rotulo: 'Giro normal', tom: 'acento' },
  baixoGiro: { rotulo: 'Baixo giro', tom: 'atencao' },
  parado: { rotulo: 'Parado', tom: 'roxo' },
  ruptura: { rotulo: 'Ruptura', tom: 'perigo' },
  excessivo: { rotulo: 'Excessivo', tom: 'info' },

  // ── produção e execução ──────────────────────────────────────────────
  planejada: { rotulo: 'Planejada', tom: 'neutro' },
  emProducao: { rotulo: 'Em produção', tom: 'info' },
  emExecucao: { rotulo: 'Em execução', tom: 'info' },

  // ── genéricos de cadastro e prazo ────────────────────────────────────
  pendente: { rotulo: 'Pendente', tom: 'atencao' },
  ativo: { rotulo: 'Ativo', tom: 'sucesso' },
  inativo: { rotulo: 'Inativo', tom: 'neutro' },
  publicado: { rotulo: 'Publicado', tom: 'sucesso' },
  conectado: { rotulo: 'Conectado', tom: 'sucesso' },
  desconectado: { rotulo: 'Desconectado', tom: 'neutro' },
  erro: { rotulo: 'Erro', tom: 'perigo' },
  atrasado: { rotulo: 'Atrasado', tom: 'perigo' },
  noPrazo: { rotulo: 'No prazo', tom: 'sucesso' },
} as const satisfies Record<string, DefinicaoDeStatus>

export type ChaveDeStatus = keyof typeof VOCABULARIO_DE_STATUS

export const CHAVES_DE_STATUS = Object.keys(VOCABULARIO_DE_STATUS) as readonly ChaveDeStatus[]

export function ehChaveDeStatus(valor: unknown): valor is ChaveDeStatus {
  return typeof valor === 'string' && Object.hasOwn(VOCABULARIO_DE_STATUS, valor)
}

export function definicaoDoStatus(chave: ChaveDeStatus): DefinicaoDeStatus {
  return VOCABULARIO_DE_STATUS[chave]
}

export function rotuloDoStatus(chave: ChaveDeStatus): string {
  return VOCABULARIO_DE_STATUS[chave].rotulo
}

export function tomDoStatus(chave: ChaveDeStatus): TomDeStatus {
  return VOCABULARIO_DE_STATUS[chave].tom
}

/**
 * A variável CSS do tom. É o único lugar do pacote que traduz tom em cor, e ele
 * devolve `var(--ui-*)` — nunca um valor: quem define a paleta é
 * `src/estilos/chassi.css`, sobre os tokens do app.
 */
export function variavelDoTom(tom: TomDeStatus): string {
  return tom === 'neutro' ? 'var(--ui-neutro)' : `var(--ui-${tom})`
}
