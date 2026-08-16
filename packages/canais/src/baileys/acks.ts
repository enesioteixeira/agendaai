/**
 * Recibos de entrega do WhatsApp → `StatusEntrega` do nosso schema.
 *
 * Regras puras, sem socket e sem banco, porque a parte difícil aqui é a ORDEM
 * dos eventos, não a integração: o WhatsApp reentrega recibos fora de ordem com
 * frequência, e um "entregue" que chega depois do "lida" não pode fazer a
 * mensagem voltar a um ✓✓ cinza na frente do operador.
 */

/** `WAMessageStatus` do Baileys. */
export const STATUS_WA = {
  ERROR: 0,
  PENDING: 1,
  SERVER_ACK: 2,
  DELIVERY_ACK: 3,
  READ: 4,
  PLAYED: 5,
} as const;

export type StatusEntrega = "pendente" | "enviada" | "entregue" | "lida" | "falhou";

/**
 * A escala de progresso. `falhou` e `pendente` ficam fora de propósito: um é
 * terminal por erro, o outro é o ponto de partida — nenhum dos dois participa
 * da comparação de "avançou ou retrocedeu".
 */
const PROGRESSO: Record<StatusEntrega, number> = {
  pendente: 0,
  enviada: 1,
  entregue: 2,
  lida: 3,
  falhou: -1,
};

/** Recibo bruto → nosso status. `null` quando o código não diz nada de novo. */
export function statusDoRecibo(codigo: number | null | undefined): StatusEntrega | null {
  switch (codigo) {
    case STATUS_WA.ERROR:
      return "falhou";
    case STATUS_WA.SERVER_ACK:
      return "enviada";
    case STATUS_WA.DELIVERY_ACK:
      return "entregue";
    case STATUS_WA.READ:
    // "Tocado" (áudio ouvido) é mais forte que lido, mas a nossa escala para em
    // `lida`: distinguir os dois na timeline não muda nada para quem atende.
    case STATUS_WA.PLAYED:
      return "lida";
    default:
      // PENDING e códigos desconhecidos não sobrescrevem o que já sabemos.
      return null;
  }
}

/**
 * Decide se o status novo deve ser gravado por cima do atual.
 *
 * - Recibo fora de ordem **não retrocede** (`entregue` depois de `lida` é ruído).
 * - `falhou` sempre entra: é informação nova e acionável, e vir depois de um
 *   `enviada` é justamente o caso real (o servidor aceitou e a entrega falhou).
 * - Uma vez `falhou`, só um progresso real tira de lá — se a mensagem acabou
 *   entregue, o operador precisa parar de ver o alerta.
 */
export function deveAtualizarAck(atual: StatusEntrega, novo: StatusEntrega): boolean {
  if (atual === novo) return false;
  if (novo === "falhou") return true;
  if (atual === "falhou") return PROGRESSO[novo] >= PROGRESSO.enviada;
  return PROGRESSO[novo] > PROGRESSO[atual];
}
