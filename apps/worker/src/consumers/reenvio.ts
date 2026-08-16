/**
 * Política de reenvio do outbox — regras puras, sem socket e sem banco.
 *
 * Sem isso, uma oscilação de rede de dois segundos matava a mensagem do
 * atendente: o outbox marcava `falhou` na primeira exceção e ninguém tentava de
 * novo. O operador só descobria olhando a timeline.
 *
 * As esperas são curtas de propósito. Isto roda dentro do envio de UMA mensagem,
 * e o cliente do outro lado está esperando: reenvio que demora meio minuto é
 * pior que falhar rápido e deixar o atendente reenviar sabendo.
 */

/** Espera antes de cada tentativa. O tamanho do array é o número de tentativas. */
export const ESPERAS_MS = [0, 2_000, 8_000] as const;

export const MAX_TENTATIVAS = ESPERAS_MS.length;

export function esperaDaTentativa(tentativa: number): number {
  return ESPERAS_MS[Math.min(tentativa, ESPERAS_MS.length - 1)] ?? 0;
}

/**
 * Vale a pena tentar de novo?
 *
 * Só erro **transitório** merece retry. Recusa definitiva — número que não
 * existe no WhatsApp, mensagem malformada, canal desconectado — não melhora com
 * repetição: repetir só atrasa o `falhou` que o atendente precisa ver para
 * tomar outra atitude.
 *
 * A classificação é por texto porque é o que o Baileys entrega: ele lança
 * `Error` com mensagem, não um código estável. Na dúvida, tratamos como
 * transitório — errar para o lado de tentar de novo custa dois segundos; errar
 * para o lado de desistir custa a mensagem.
 */
const DEFINITIVOS = [
  /not[- ]?authorized/i,
  /forbidden/i,
  /jid.*(invalid|malformed)/i,
  /invalid.*jid/i,
  /not.*on.*whatsapp/i,
  /connection closed/i, // socket morreu: o gestor reabre e a varredura seguinte pega
];

export function ehTransitorio(erro: unknown): boolean {
  const texto = erro instanceof Error ? erro.message : String(erro);
  return !DEFINITIVOS.some((r) => r.test(texto));
}

export function deveTentarDeNovo(tentativa: number, erro: unknown): boolean {
  return tentativa < MAX_TENTATIVAS - 1 && ehTransitorio(erro);
}
