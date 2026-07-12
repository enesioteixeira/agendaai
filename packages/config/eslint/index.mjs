// Config ESLint compartilhada — inclui a regra de fronteira do unsafe.ts
// (doc 09 §3.2): import de packages/db/src/unsafe.ts é PROIBIDO fora de
// packages/db (interno) e apps/worker/src/consumers/plataforma.ts.
// Cada workspace estende esta base; a exceção do worker é concedida por
// override LOCAL naquele único arquivo, nunca aqui.

export const regraFronteiraUnsafe = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: ["@atende/db/unsafe", "**/packages/db/src/unsafe*"],
          message:
            "prismaSemTenant é lint-gated (regra inviolável 1). Allowlist: interno a packages/db e apps/worker/src/consumers/plataforma.ts — doc 09 §3.2.",
        },
      ],
    },
  ],
};

export default {
  rules: {
    ...regraFronteiraUnsafe,
  },
};
