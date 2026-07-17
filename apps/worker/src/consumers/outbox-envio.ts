// Envio outbox (doc 01: eventos via outbox): o painel grava a Mensagem de
// saída como `pendente` NA MESMA transação do que a originou — a tabela
// Mensagem é a outbox. Este poller varre pendentes de canais Baileys, faz um
// CLAIM atômico por tenant (updateMany pendente→enviando; count=0 = outro
// worker levou) e envia pelo conector do socket vivo. Falha → `falhou` (o
// painel mostra e permite reenviar). pg-boss segue reservado aos jobs dos
// motores (Bloco 4) — o caminho humano não precisa de fila.

import { prisma, runWithTenant } from "@atende/db";
import { conectorDoCanal } from "../sockets/gestor.js";
import { listarMensagensPendentesBaileys } from "./plataforma.js";

async function enviarUma(m: {
  id: string;
  empresaId: string;
  canalId: string;
  conversaId: string;
  texto: string | null;
}): Promise<void> {
  await runWithTenant({ empresaId: m.empresaId }, async () => {
    // claim atômico: só um worker ganha a mensagem
    const claim = await prisma.mensagem.updateMany({
      where: { id: m.id, statusEntrega: "pendente" },
      data: { statusEntrega: "enviada" }, // otimista; falha reverte p/ falhou
    });
    if (claim.count === 0) return;

    const conector = conectorDoCanal(m.canalId);
    if (!conector) {
      await prisma.mensagem.update({
        where: { id: m.id },
        data: { statusEntrega: "falhou" },
      });
      return;
    }
    try {
      const { idExterno } = await conector.enviar({
        empresaId: m.empresaId,
        canalId: m.canalId,
        conversaId: m.conversaId,
        texto: m.texto ?? "",
      });
      await prisma.mensagem.update({ where: { id: m.id }, data: { idExterno } });
    } catch (e) {
      console.error(`[outbox] envio falhou (mensagem ${m.id}):`, e);
      await prisma.mensagem.update({
        where: { id: m.id },
        data: { statusEntrega: "falhou" },
      });
    }
  });
}

export function iniciarOutboxEnvio(intervaloMs = 3_000): void {
  let rodando = false;
  setInterval(() => {
    if (rodando) return; // sem sobreposição de varreduras
    rodando = true;
    listarMensagensPendentesBaileys()
      .then(async (pendentes) => {
        for (const m of pendentes) await enviarUma(m);
      })
      .catch((e) => console.error("[outbox] varredura falhou:", e))
      .finally(() => {
        rodando = false;
      });
  }, intervaloMs);
}
