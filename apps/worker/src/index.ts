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

const { default: PgBoss } = await import("pg-boss");
const { iniciarHealthServer } = await import("./health.js");
const { iniciarGestorSockets } = await import("./sockets/gestor.js");
const { iniciarOutboxEnvio } = await import("./consumers/outbox-envio.js");

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
