// Bootstrap do worker (doc 09): pg-boss.start() → sockets → consumers → hub SSE → health.
// Bloco 0: só health + conexão pg-boss (valida a fundação). Sockets Baileys
// entram no Bloco 3; consumers de lembrete/régua/IA nos Blocos 4–5.

import PgBoss from "pg-boss";
import { iniciarHealthServer } from "./health.js";

const PORTA_HEALTH = Number(process.env.PORT ?? 8080);

async function main(): Promise<void> {
  iniciarHealthServer(PORTA_HEALTH);
  console.log(`[worker] health em :${PORTA_HEALTH}/healthz`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("[worker] DATABASE_URL ausente — pg-boss não iniciado (modo fundação)");
    return;
  }

  const boss = new PgBoss({ connectionString: databaseUrl, schema: "pgboss" });
  boss.on("error", (err) => console.error("[worker] pg-boss error:", err));
  await boss.start();
  console.log("[worker] pg-boss iniciado");
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
