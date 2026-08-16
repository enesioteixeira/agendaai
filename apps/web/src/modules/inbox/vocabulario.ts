import type { NomeDeIcone } from '@atende/ui'

/**
 * O vocabulário visual da inbox: como cada canal e cada estado de conversa se
 * apresentam. Mora num módulo só porque a lista, a timeline e o painel de
 * contexto precisam concordar — canal desenhado de um jeito na lista e de outro
 * no cabeçalho da conversa faz o operador achar que são conversas diferentes.
 *
 * `Record` completo e não parcial, de propósito: acrescentar um valor ao enum
 * `TipoCanal` do schema sem descrever aqui como ele aparece vira erro de
 * compilação, e não um canal que renderiza cinza e sem nome em produção.
 */

export type TipoCanal =
  | 'whatsapp_oficial'
  | 'whatsapp_baileys'
  | 'telegram'
  | 'webchat'
  | 'instagram'
  | 'messenger'
  | 'email'

export type EstadoConversa = 'bot_arvore' | 'bot_ia' | 'fila_humano' | 'humano' | 'encerrada'

/** Tom do `Badge` do chassi — o mesmo vocabulário de status do ERP. */
export type Tom = 'neutro' | 'sucesso' | 'perigo' | 'atencao' | 'info' | 'acento' | 'roxo'

export interface AparenciaDoCanal {
  readonly rotulo: string
  readonly icone: NomeDeIcone
  /** Curto para caber na lista, onde o espaço é do texto da mensagem. */
  readonly curto: string
}

export const CANAIS: Record<TipoCanal, AparenciaDoCanal> = {
  whatsapp_oficial: { rotulo: 'WhatsApp oficial', curto: 'WhatsApp', icone: 'conversa' },
  whatsapp_baileys: { rotulo: 'WhatsApp', curto: 'WhatsApp', icone: 'conversa' },
  telegram: { rotulo: 'Telegram', curto: 'Telegram', icone: 'conversa' },
  webchat: { rotulo: 'Webchat', curto: 'Web', icone: 'conversa' },
  instagram: { rotulo: 'Instagram', curto: 'Instagram', icone: 'conversa' },
  messenger: { rotulo: 'Messenger', curto: 'Messenger', icone: 'conversa' },
  email: { rotulo: 'E-mail', curto: 'E-mail', icone: 'nota' },
}

export interface AparenciaDoEstado {
  readonly rotulo: string
  readonly tom: Tom
}

/**
 * Os tons carregam a leitura operacional, não a estética: `fila_humano` é
 * `atencao` porque é o único estado que pede ação de alguém AGORA; os dois
 * estados de bot são `info` porque estão indo bem sem ninguém; `humano` é
 * `sucesso` porque alguém já pegou.
 */
export const ESTADOS: Record<EstadoConversa, AparenciaDoEstado> = {
  fila_humano: { rotulo: 'Na fila', tom: 'atencao' },
  humano: { rotulo: 'Em atendimento', tom: 'sucesso' },
  bot_ia: { rotulo: 'Agente de IA', tom: 'info' },
  bot_arvore: { rotulo: 'Fluxo', tom: 'info' },
  encerrada: { rotulo: 'Encerrada', tom: 'neutro' },
}
