// Patch pós-`prisma generate` para Cloudflare Workers (OpenNext).
//
// PROBLEMA: o package.json gerado em node_modules/.prisma/client lista a
// condição "node" ANTES de "workerd" em exports/imports. O esbuild do OpenNext
// builda com platform=node E a condição "workerd" ativas — e resolve pela
// PRIMEIRA condição ativa na ordem do arquivo, ou seja, "node" → index.js →
// carrega o compilador WASM via fs.readFileSync → quebra no workerd
// ([unenv] fs.readFileSync is not implemented).
//
// FIX: reordenar cada objeto condicional pondo edge-light/workerd/worker antes
// de "node". Inofensivo para Node puro (testes/CI/worker): lá a condição
// "workerd" nunca está ativa, então a resolução cai em "node" do mesmo jeito.
//
// Roda no `generate` do packages/db (local, CI e Workers Builds).

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve(".prisma/client/package.json");

const EDGE_FIRST = ["types", "edge-light", "workerd", "worker", "browser", "node"];

function reordenar(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const chaves = Object.keys(obj);
  const ordenadas = [
    ...EDGE_FIRST.filter((c) => chaves.includes(c)),
    ...chaves.filter((c) => !EDGE_FIRST.includes(c)),
  ];
  const novo = {};
  for (const c of ordenadas) novo[c] = reordenar(obj[c]);
  return novo;
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
if (pkg.exports) pkg.exports = reordenar(pkg.exports);
if (pkg.imports) pkg.imports = reordenar(pkg.imports);
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log(`[patch-prisma-workerd] condições reordenadas (workerd antes de node) em ${pkgPath}`);
