// Build de produção do worker.
//
// Por que não é `tsc`: o monorepo inteiro roda com resolução "bundler"
// (tsconfig.base) porque o apps/web consome os packages como TS cru via
// transpilePackages, e um regime só evita o conflito descrito no doc 11.
// O efeito colateral é que o emit do tsc não serve para produção: ele não
// acrescenta extensão nos imports relativos e resolve @atende/* para o
// FONTE TypeScript, de modo que `node dist/index.js` morre com
// ERR_UNKNOWN_FILE_EXTENSION ao tentar carregar packages/core/src/index.ts.
// Além disso o tsc emitia em dist/apps/worker/src/, e não em dist/.
//
// A saída aqui é um bundle único: o código do repositório (worker + packages
// @atende/*) entra no arquivo; tudo que vem de node_modules fica externo e é
// resolvido em runtime, porque a imagem carrega node_modules e o client
// gerado do Prisma.

import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));

/**
 * Marca como externo tudo que não é do repositório.
 *
 * A regra é por origem, não por lista: qualquer import que não seja relativo
 * e não seja `@atende/*` mora em node_modules e continua lá. Assim a adição
 * de uma dependência nova não exige tocar neste arquivo — que é exatamente o
 * tipo de manutenção que se esquece e só aparece quebrando o deploy.
 */
const externoForaDoRepo = {
  name: "externo-fora-do-repo",
  setup(construtor) {
    construtor.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return null;
      const id = args.path;
      const doRepo = id.startsWith(".") || id.startsWith("/") || id.startsWith("@atende/");
      return doRepo ? null : { path: id, external: true };
    });
  },
};

const resultado = await build({
  entryPoints: [join(raiz, "src/index.ts")],
  outfile: join(raiz, "dist/index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  // O bootstrap lê apps/worker/.env por import.meta.url; em ESM o esbuild
  // preserva import.meta, então o caminho continua relativo ao dist/.
  logLevel: "info",
  metafile: true,
  plugins: [externoForaDoRepo],
});

const bytes = Object.values(resultado.metafile.outputs).reduce((soma, o) => soma + o.bytes, 0);
console.log(`bundle: ${(bytes / 1024).toFixed(0)} KB em apps/worker/dist/index.js`);
