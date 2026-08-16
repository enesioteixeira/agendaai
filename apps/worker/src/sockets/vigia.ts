/**
 * A decisão do watchdog, isolada de socket e de banco.
 *
 * Mora fora do `gestor.ts` porque aquele arquivo importa o Baileys inteiro:
 * testar a regra a partir de lá custaria carregar o SDK, e a regra é a parte
 * que realmente pode errar.
 */

/** Silêncio absoluto que caracteriza socket travado. */
export const SILENCIO_ZUMBI_MS = 5 * 60_000;

export interface EstadoDoSocket {
  /** Handshake concluído (evento `connection.update` com `open`). */
  readonly conectado: boolean;
  /** Último sinal de vida: conexão, QR emitido ou mensagem recebida. */
  readonly ultimoSinal: number;
  /** Remoção intencional — o gestor já está desligando este canal. */
  readonly encerrado: boolean;
}

/**
 * Um socket é zumbi quando fica em silêncio absoluto **sem ter conectado**.
 *
 * As três condições, e por que cada uma:
 *
 * - **`encerrado` nunca é zumbi**: o gestor já está desligando o canal de
 *   propósito; derrubar de novo criaria uma corrida com a remoção.
 * - **Conectado e quieto é normal**: ninguém escrever por cinco minutos é o
 *   estado natural de uma conversa. O que não é natural é nunca completar o
 *   handshake e ao mesmo tempo parar de emitir QR.
 * - **Silêncio é medido do último sinal**, não da abertura: um canal esperando
 *   alguém escanear o QR emite QR de tempos em tempos, então não acumula
 *   silêncio. Um canal travado emite nada.
 */
export function ehZumbi(estado: EstadoDoSocket, agora: number): boolean {
  if (estado.encerrado) return false;
  if (estado.conectado) return false;
  return agora - estado.ultimoSinal >= SILENCIO_ZUMBI_MS;
}
