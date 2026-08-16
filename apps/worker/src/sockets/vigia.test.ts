import { describe, expect, it } from "vitest";

import { SILENCIO_ZUMBI_MS, ehZumbi } from "./vigia";

const AGORA = 1_700_000_000_000;
const faz = (ms: number) => AGORA - ms;

describe("watchdog de socket", () => {
  it("derruba o socket que nunca conectou e parou de dar sinal", () => {
    const travado = { conectado: false, encerrado: false, ultimoSinal: faz(SILENCIO_ZUMBI_MS + 1) };
    expect(ehZumbi(travado, AGORA)).toBe(true);
  });

  /**
   * O falso positivo que importa: um canal esperando alguém escanear o QR fica
   * legitimamente desconectado por muito tempo. O que o separa do travado é que
   * ele emite QR de tempos em tempos, renovando o sinal.
   */
  it("não derruba o canal que está esperando o QR ser escaneado", () => {
    const pareando = { conectado: false, encerrado: false, ultimoSinal: faz(30_000) };
    expect(ehZumbi(pareando, AGORA)).toBe(false);
  });

  it("não derruba conversa parada — socket conectado e quieto é o normal", () => {
    const quieto = { conectado: true, encerrado: false, ultimoSinal: faz(SILENCIO_ZUMBI_MS * 10) };
    expect(ehZumbi(quieto, AGORA)).toBe(false);
  });

  it("não mexe em canal que o gestor já está desligando", () => {
    const saindo = { conectado: false, encerrado: true, ultimoSinal: faz(SILENCIO_ZUMBI_MS * 3) };
    expect(ehZumbi(saindo, AGORA)).toBe(false);
  });

  it("respeita a fronteira exata do silêncio", () => {
    const base = { conectado: false, encerrado: false };
    expect(ehZumbi({ ...base, ultimoSinal: faz(SILENCIO_ZUMBI_MS - 1) }, AGORA)).toBe(false);
    expect(ehZumbi({ ...base, ultimoSinal: faz(SILENCIO_ZUMBI_MS) }, AGORA)).toBe(true);
  });
});
