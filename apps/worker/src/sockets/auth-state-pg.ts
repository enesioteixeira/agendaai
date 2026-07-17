// ArmazenamentoAuth do Baileys sobre o Postgres (AuthStateBaileys), com
// valores cifrados AES-256-GCM (regra 15). A sessão WhatsApp sobrevive à
// máquina — o worker é descartável (doc 01). Roda sob runWithTenant: cada
// canal pertence a um tenant e a extension injeta o empresaId.

import { crypto as cryptoCore } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import type { ArmazenamentoAuth } from "@atende/canais";

const { cifrarSegredo, decifrarSegredo } = cryptoCore;

export function criarArmazenamentoAuthPg(empresaId: string, canalId: string): ArmazenamentoAuth {
  const ctx = { empresaId };
  return {
    async ler(chave: string): Promise<string | null> {
      const linha = await runWithTenant(ctx, () =>
        prisma.authStateBaileys.findUnique({
          where: { empresaId_canalId_chave: { empresaId, canalId, chave } },
        }),
      );
      return linha ? decifrarSegredo(linha.valorCifrado) : null;
    },
    async gravar(chave: string, valor: string): Promise<void> {
      const valorCifrado = cifrarSegredo(valor);
      await runWithTenant(ctx, () =>
        prisma.authStateBaileys.upsert({
          where: { empresaId_canalId_chave: { empresaId, canalId, chave } },
          create: { canalId, chave, valorCifrado } as never,
          update: { valorCifrado },
        }),
      );
    },
    async remover(chave: string): Promise<void> {
      await runWithTenant(ctx, () =>
        prisma.authStateBaileys.deleteMany({ where: { canalId, chave } }),
      );
    },
  };
}

/** Apaga TODA a sessão do canal (logout/re-pareamento). */
export async function limparAuthState(empresaId: string, canalId: string): Promise<void> {
  await runWithTenant({ empresaId }, () =>
    prisma.authStateBaileys.deleteMany({ where: { canalId } }),
  );
}
