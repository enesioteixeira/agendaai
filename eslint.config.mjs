// Portão de lint do monorepo.
//
// Existe por um motivo só: a regra inviolável 1 e o doc 09 §3.2 dizem que o
// import de `prismaSemTenant` é "lint-gated" — e até aqui não havia lint nenhum
// no repositório, então a afirmação era falsa. A única defesa automatizada da
// fronteira de tenancy era o teste de isolamento.
//
// A configuração é única e mora na raiz, em vez de uma por workspace como o
// doc 09 previa. O motivo é que a regra é, por natureza, sobre CAMINHOS que
// cruzam pacotes: o que se quer expressar é "ninguém importa unsafe, exceto
// estes dois lugares". Distribuir isso em nove configurações espalharia a
// allowlist por nove arquivos e tornaria impossível ler a fronteira inteira de
// uma vez. A divergência está registrada em docs/11-adaptacoes-implementacao.md.

import parserTs from "@typescript-eslint/parser";
import pluginNext from "@next/eslint-plugin-next";
import { regraFronteiraUnsafe } from "./packages/config/eslint/index.mjs";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.open-next/**",
      "**/dist/**",
      "**/build/**",
      "**/.wrangler/**",
      "packages/db/src/generated/**",
    ],
  },

  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    languageOptions: {
      parser: parserTs,
      ecmaVersion: 2022,
      sourceType: "module",
      // Sem `project`: a regra de fronteira é sintática e não precisa de tipo.
      // Ligar checagem com tipo aqui custaria minutos por execução e o portão
      // deixaria de ser barato — portão caro é portão que se desliga.
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...regraFronteiraUnsafe,
    },
  },

  // O apps/web é Next, e as regras dele valem só ali.
  //
  // Entram porque já havia no código uma diretiva desligando
  // `@next/next/no-img-element` — e diretiva que aponta para regra inexistente
  // é erro de lint, não comentário. Ou a regra existe e a exceção é real, ou o
  // comentário é decoração. Aqui ela é real: o QR de pareamento é um data URL,
  // que o next/image não tem como otimizar.
  {
    files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
    plugins: { "@next/next": pluginNext },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
      // App Router puro: não existe diretório `pages`, e a regra que procura por
      // ele imprime um aviso a cada execução. Aviso que sempre aparece é ruído,
      // e ruído treina a equipe a ignorar a saída do portão.
      "@next/next/no-html-link-for-pages": "off",
    },
  },

  // A allowlist do doc 09 §3.2, e nada além dela.
  //
  // `packages/db` é interno à própria porta do banco: é lá que `prismaSemTenant`
  // nasce e é lá que as operações sem tenant (login, resolução de slug, aceite
  // de convite) precisam legitimamente existir.
  //
  // `apps/worker/src/consumers/plataforma.ts` é a exceção concedida: ele lê
  // metadados de plano e assinatura de vários tenants para fechar o mês, e as
  // duas funções que fazem isso são somente leitura.
  {
    files: [
      "packages/db/**/*.ts",
      "apps/worker/src/consumers/plataforma.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
];
