import type { SituacaoPrazo } from '@atende/core'
import type { NomeDeIcone } from '@atende/ui'

// Os dois imports são `import type` de propósito, e isso não é estilo: este
// módulo é lido por componentes `"use client"`, e `@atende/core` reexporta o
// módulo de cripto, que abre com `import crypto from "node:crypto"`. Import de
// tipo é apagado na compilação; um import de VALOR do core aqui arrastaria
// node:crypto para o bundle do navegador (o mesmo motivo está escrito em
// `modules/atendimento/vocabulario.ts`).

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

/**
 * Reexportado daqui para que nenhum componente `"use client"` da inbox precise
 * escrever `from '@atende/core'` — é neste arquivo que mora o aviso de por que
 * esse import só pode ser de TIPO, e um `import type` que vira `import` num
 * arquivo qualquer não teria o aviso ao lado.
 */
export type { SituacaoPrazo }

export interface AparenciaDoPrazo {
  readonly rotulo: string
  /** Cabe na linha apertada da lista, onde o texto da mensagem tem prioridade. */
  readonly curto: string
  readonly tom: Tom
  /**
   * `true` quando a conversa precisa de alguém AGORA. É o que a lista usa para
   * destacar a linha inteira — o selo sozinho se perde entre canal, estado e
   * fila, e "perto de estourar" que não é visto de longe não serviu para nada.
   */
  readonly urgente: boolean
}

/**
 * Como cada situação de prazo (`situacaoDoPrazo`, do núcleo) se apresenta.
 *
 * `cumprido` é `sucesso` e NÃO urgente mesmo quando a resposta saiu atrasada: o
 * atraso consumado é assunto do relatório, e pintar de vermelho o que já foi
 * respondido competiria por atenção com o que ainda dá para salvar. Quem decide
 * isso é o núcleo, que devolve `cumprido` assim que existe `primeiraRespostaEm`;
 * aqui só se escolhe a cor.
 */
export const PRAZOS: Record<SituacaoPrazo, AparenciaDoPrazo> = {
  estourado: { rotulo: 'Prazo estourado', curto: 'Estourou', tom: 'perigo', urgente: true },
  perto_do_estouro: {
    rotulo: 'Perto de estourar',
    curto: 'Estourando',
    tom: 'atencao',
    urgente: true,
  },
  no_prazo: { rotulo: 'Dentro do prazo', curto: 'No prazo', tom: 'info', urgente: false },
  cumprido: { rotulo: 'Já respondida', curto: 'Respondida', tom: 'sucesso', urgente: false },
  sem_prazo: { rotulo: 'Sem prazo', curto: 'Sem prazo', tom: 'neutro', urgente: false },
}

/**
 * `EtiquetaConversa.cor` guarda um TOM do chassi ("info", "sucesso"…), não hex
 * cru — a lista que a tela de configuração oferece é `CORES_DE_ETIQUETA`, em
 * `modules/atendimento/vocabulario.ts`, e é a mesma família de tons do `Badge`.
 *
 * Aqui a leitura é defensiva porque a coluna é `String?`: etiqueta gravada antes
 * de a lista fechar, ou por importação futura, não pode derrubar a inbox — cai
 * em `neutro`, que é legível nos dois temas.
 */
const TONS_DE_ETIQUETA = new Set<string>(['neutro', 'info', 'sucesso', 'atencao', 'perigo'])

export function tomDaEtiqueta(cor: string | null | undefined): Tom {
  return cor !== null && cor !== undefined && TONS_DE_ETIQUETA.has(cor) ? (cor as Tom) : 'neutro'
}
