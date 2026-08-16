// Recibos de entrega (✓ → ✓✓ → lida) das mensagens que enviamos pelo Baileys.
// As regras de "este recibo avança ou é ruído fora de ordem?" são puras e vivem
// em @atende/canais (`acks.ts`); aqui fica só o encontro com o banco.

import { deveAtualizarAck, statusDoRecibo, type StatusEntrega } from "@atende/canais";
import { prisma, runWithTenant } from "@atende/db";

export interface ReciboBruto {
  readonly idExterno: string;
  readonly codigo: number | null;
}

/**
 * Aplica um lote de recibos. Casa pelo `idExterno` — o id que o WhatsApp
 * devolveu no envio e que o outbox gravou na `Mensagem`.
 *
 * A leitura antes da escrita existe para poder comparar com o status atual: sem
 * isso um `entregue` que chega atrasado sobrescreveria um `lida` já gravado, e
 * a mensagem "voltaria" na timeline do operador. Não é lock — recibo é
 * idempotente por natureza e a corrida entre dois recibos do mesmo lote termina
 * no mesmo lugar.
 */
export async function aplicarRecibos(
  empresaId: string,
  recibos: readonly ReciboBruto[],
): Promise<void> {
  const traduzidos = recibos
    .map((r) => ({ idExterno: r.idExterno, status: statusDoRecibo(r.codigo) }))
    .filter((r): r is { idExterno: string; status: StatusEntrega } => r.status !== null);

  if (traduzidos.length === 0) return;

  await runWithTenant({ empresaId }, async () => {
    const atuais = await prisma.mensagem.findMany({
      where: { idExterno: { in: traduzidos.map((r) => r.idExterno) }, direcao: "saida" },
      select: { id: true, idExterno: true, statusEntrega: true },
    });

    const porIdExterno = new Map(atuais.map((m) => [m.idExterno, m]));

    for (const recibo of traduzidos) {
      const mensagem = porIdExterno.get(recibo.idExterno);
      // Recibo de mensagem que não é nossa (ou de antes deste banco): ignorar
      // em silêncio. Não é erro — o WhatsApp reenvia recibos antigos ao reconectar.
      if (!mensagem) continue;
      if (!deveAtualizarAck(mensagem.statusEntrega as StatusEntrega, recibo.status)) continue;

      await prisma.mensagem.update({
        where: { id: mensagem.id },
        data: { statusEntrega: recibo.status },
      });
    }
  });
}
