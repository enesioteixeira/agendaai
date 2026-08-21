/**
 * Reserva de envio do outbox — regra pura, sem socket e sem banco.
 *
 * O claim do outbox é otimista: um worker marca a mensagem como `enviando` e
 * sai para entregá-la. Se ele morrer no meio — máquina desligada, processo
 * derrubado, container reiniciado —, ninguém mais toca naquela linha e ela fica
 * parada em `enviando` para sempre.
 *
 * O carimbo `envioReservadoEm` é o que torna essa órfã descobrível: reserva
 * mais velha que o teto abaixo é, por definição, worker que não voltou.
 *
 * **Por que a órfã vira `falhou` e não volta para `pendente`.** Reenviar
 * automaticamente parece mais gentil, e é a escolha errada aqui. O conector
 * devolve o identificador externo só depois de entregar; se a morte aconteceu
 * *entre* a entrega e a gravação, o reenvio automático manda a mesma mensagem
 * duas vezes para o cliente do nosso cliente — e mensagem duplicada em conversa
 * comercial é dano que ninguém desfaz. Marcar `falhou` devolve a decisão a quem
 * tem contexto para tomá-la: o atendente vê o ⚠ na timeline e reenvia se for o
 * caso. O defeito que estamos consertando é a perda *silenciosa*; trocá-la por
 * uma duplicação silenciosa não seria conserto.
 */

/**
 * Teto da reserva.
 *
 * Precisa ser folgado em relação ao pior envio legítimo — três tentativas com
 * esperas de 0s, 2s e 8s (`reenvio.ts`), mais o tempo dos próprios envios, que
 * o Baileys não limita. Dois minutos deixam margem larga: abaixo disso o
 * varredor arriscaria declarar órfã uma mensagem que ainda está saindo.
 */
export const LEASE_ENVIO_MS = 120_000;

/** A reserva estourou o teto? Reserva sem carimbo conta como estourada. */
export function envioExpirou(
  reservadoEm: Date | null | undefined,
  agora: Date,
  leaseMs: number = LEASE_ENVIO_MS,
): boolean {
  // Sem carimbo não há como saber quando começou. Isso só acontece com linha
  // escrita antes desta migration, ou por caminho que esqueceu de carimbar —
  // e nos dois casos deixar presa em `enviando` é o pior desfecho possível.
  if (!reservadoEm) return true;
  return agora.getTime() - reservadoEm.getTime() >= leaseMs;
}
