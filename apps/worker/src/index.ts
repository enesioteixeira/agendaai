// Bootstrap do worker (doc 09): health → pg-boss → consumers → gestor de
// sockets Baileys. Bloco 3: roda na MÁQUINA LOCAL do dono (doc 11 §nota) —
// o painel em produção fala com ele só pelo banco (filas pg-boss + polling).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Carrega apps/worker/.env ANTES de qualquer import que toque process.env
// (rodada local — doc 11; em produção as vars vêm do ambiente e o arquivo
// não existe). Não sobrescreve variável já definida no ambiente.
try {
  const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"), "utf8");
  for (const linha of env.split("\n")) {
    const m = linha.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[3];
  }
} catch {
  // sem .env — segue com o ambiente do processo
}

const { iniciarFila, pararFila } = await import("./fila.js");
const { iniciarHealthServer } = await import("./health.js");
const { iniciarGestorSockets } = await import("./sockets/gestor.js");
const { iniciarOutboxEnvio } = await import("./consumers/outbox-envio.js");
const { iniciarConsumerIaTurno } = await import("./consumers/ia-turno.js");

const PORTA_HEALTH = Number(process.env.PORT ?? 8080);

/** Tudo que precisa ser desligado na ordem certa. */
const desligar: (() => void | Promise<void>)[] = [];

async function main(): Promise<void> {
  const servidor = iniciarHealthServer(PORTA_HEALTH);
  desligar.push(() => new Promise<void>((r) => servidor.close(() => r())));
  console.log(`[worker] health em :${PORTA_HEALTH}/healthz`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("[worker] DATABASE_URL ausente — pg-boss não iniciado (modo fundação)");
    return;
  }
  if (!process.env.ENCRYPTION_KEY) {
    console.warn("[worker] ENCRYPTION_KEY ausente — sockets Baileys não iniciados");
    return;
  }

  await iniciarFila(databaseUrl);
  desligar.push(pararFila);
  console.log("[worker] fila pg-boss pronta (ia-turno, expirar-propostas, expirar-envios)");

  desligar.push(iniciarGestorSockets());
  console.log("[worker] gestor de sockets Baileys ativo (reconciliação a cada 15s)");

  desligar.push(iniciarOutboxEnvio());
  console.log("[worker] outbox de envio ativo (varredura a cada 3s)");

  await iniciarConsumerIaTurno();
}

// Baileys engole rejections internas (fix herdado do ev-tracker, doc 08 §3.2):
// logar e seguir — derrubar o processo por rejection de socket mata N tenants.
process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandledRejection:", reason);
});

/**
 * Encerramento gracioso.
 *
 * Sem isto, todo `Ctrl+C` matava socket no meio de envio e job no meio de
 * execução — e durante o desenvolvimento isso acontece dezenas de vezes por dia.
 * A ordem importa: parar de aceitar trabalho novo (intervalos e fila) antes de
 * fechar o servidor.
 *
 * O teto de 10 s existe porque um socket Baileys travado seguraria o processo
 * para sempre, e um terminal que não devolve o prompt é pior que um encerramento
 * abrupto. `unref()` para o próprio timer não manter o processo vivo.
 */
let encerrando = false;
for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.on(sinal, () => {
    if (encerrando) return; // segundo Ctrl+C não reentra
    encerrando = true;
    console.log(`[worker] ${sinal} recebido — encerrando…`);

    setTimeout(() => {
      console.warn("[worker] encerramento demorou demais — saindo à força");
      process.exit(1);
    }, 10_000).unref();

    void (async () => {
      for (const parar of desligar.reverse()) {
        try {
          await parar();
        } catch (e) {
          console.error("[worker] falha ao desligar componente:", e);
        }
      }
      console.log("[worker] encerrado.");
      process.exit(0);
    })();
  });
}

main().catch((err) => {
  console.error("[worker] falha fatal no bootstrap:", err);
  process.exit(1);
});
