// /healthz para monitoramento externo (BetterStack) — worker caído = WhatsApp mudo (doc 09).
// A ÚNICA outra conexão de entrada que a VM aceitará é o hub SSE (Bloco 3).

import { createServer, type Server } from "node:http";

import { filaAtiva } from "./fila.js";
import { totalDeSockets, ultimaReconciliacao } from "./sockets/gestor.js";

/**
 * O corpo diz se o worker está **útil**, não só se responde.
 *
 * O bootstrap tem dois early returns: sem `DATABASE_URL` ele para antes da fila,
 * sem `ENCRYPTION_KEY` para antes dos sockets. Nos dois casos o processo segue
 * vivo — e um `/healthz` que só devolvesse `{ ok: true }` mostraria verde com o
 * WhatsApp mudo. É o pior tipo de monitoramento: o que tranquiliza sem informar.
 */
export function iniciarHealthServer(porta: number): Server {
  const server = createServer((req, res) => {
    if (req.url === "/healthz") {
      const sockets = totalDeSockets();
      const reconciliadoHa = ultimaReconciliacao()
        ? Math.round((Date.now() - ultimaReconciliacao()!) / 1000)
        : null;

      // `degradado` quando a fila não subiu ou a reconciliação parou de rodar
      // (ela roda a cada 15 s; 60 s sem reconciliar significa laço travado).
      const degradado = !filaAtiva() || reconciliadoHa === null || reconciliadoHa > 60;

      res.writeHead(degradado ? 503 : 200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: !degradado,
          uptime: Math.round(process.uptime()),
          fila: filaAtiva(),
          sockets,
          reconciliadoHaSegundos: reconciliadoHa,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(porta);
  return server;
}
