// Prepara o banco de teste uma vez por rodada.
//
// Fica em `globalSetup` e não em `setupFiles` de propósito: `setupFiles` roda
// em cada worker, e criar banco e aplicar migration N vezes em paralelo é
// desperdício com chance de corrida. Aqui roda uma vez, antes de tudo.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import { nomeDoBanco, urlDoBancoDeTeste } from "./vitest.banco-de-teste";

export default async function preparar(): Promise<void> {
  if (process.env.DATABASE_URL_TEST) return; // destino escolhido à mão vence.

  const urlTeste = urlDoBancoDeTeste(process.env.DATABASE_URL);
  if (!urlTeste) return; // sem banco local, os e2e seguem pulados.

  const nome = nomeDoBanco(urlTeste);

  // A conexão de administração vai no banco `postgres`, que sempre existe:
  // não se cria um banco estando conectado a ele.
  const admin = new URL(urlTeste);
  admin.pathname = "/postgres";

  const cliente = new Client({ connectionString: admin.toString() });
  try {
    await cliente.connect();
  } catch {
    // Container fora do ar. Não é erro desta rodada: os e2e pulam, e quem quer
    // garantia usa `EXIGIR_DB_TEST=1` (ver `src/exigencia.test.ts`).
    return;
  }

  try {
    const existe = await cliente.query("SELECT 1 FROM pg_database WHERE datname = $1", [nome]);
    if (existe.rowCount === 0) {
      // Nome de banco não entra como parâmetro em CREATE DATABASE; ele vem de
      // `DATABASE_URL`, que é do próprio ambiente, e as aspas duplas o isolam.
      await cliente.query(`CREATE DATABASE "${nome.replace(/"/g, '""')}"`);
    }
  } finally {
    await cliente.end();
  }

  // `migrate deploy` é idempotente: na segunda rodada não faz nada. Rodar
  // sempre custa menos que descobrir, no meio de um teste vermelho, que o banco
  // de teste está uma migration atrás do schema.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    env: { ...process.env, DATABASE_URL: urlTeste },
    stdio: "ignore",
    shell: process.platform === "win32",
  });

  process.env.DATABASE_URL_TEST = urlTeste;
}
