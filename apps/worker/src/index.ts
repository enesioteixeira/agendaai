// Bootstrap do worker (doc 09): health → pg-boss → consumers → gestor de
// sockets Baileys. Bloco 3: roda na MÁQUINA LOCAL do dono (doc 11 §nota) —
// o painel em produção fala com ele só pelo banco (filas pg-boss + polling).

import PgBoss from "pg-boss";
import { iniciarHealthServer } from "./health.js";
import { iniciarGestorSockets } from "./sockets/gestor.js";
import { iniciarOutboxEnvio } from "./consumers/outbox-envio.js";

const PORTA_HEALTH = Number(process.env.PORT ?? 8080);

async function main(): Promise<void> {
  iniciarHealthServer(PORTA_HEALTH);
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

  const boss = new PgBoss({ connectionString: databaseUrl, schema: "pgboss" });
  boss.on("error", (err) => console.error("[worker] pg-boss error:", err));
  await boss.start();
  console.log("[worker] pg-boss iniciado (filas dos motores entram no Bloco 4)");

  iniciarGestorSockets();
  console.log("[worker] gestor de sockets Baileys ativo (reconciliação a cada 15s)");

  iniciarOutboxEnvio();
  console.log("[worker] outbox de envio ativo (varredura a cada 3s)");
}

// Baileys engole rejections internas (fix herdado do ev-tracker, doc 08 §3.2):
// logar e seguir — derrubar o processo por rejection de socket mata N tenants.
process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandledRejection:", reason);
});

main().catch((err) => {
  console.error("[worker] falha fatal no bootstrap:", err);
  process.exit(1);
});
