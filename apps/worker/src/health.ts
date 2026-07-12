// /healthz para monitoramento externo (BetterStack) — worker caído = WhatsApp mudo (doc 09).
// A ÚNICA outra conexão de entrada que a VM aceitará é o hub SSE (Bloco 3).

import { createServer, type Server } from "node:http";

export function iniciarHealthServer(porta: number): Server {
  const server = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(porta);
  return server;
}
