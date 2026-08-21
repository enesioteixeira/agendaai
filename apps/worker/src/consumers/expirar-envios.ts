// Fecha reservas órfãs do outbox — `enviando` de um worker que não voltou.
//
// Mora numa fila agendada, e não dentro da varredura do outbox, por duas razões
// que só aparecem quando há mais de um worker no ar:
//
// 1. **Cadência.** O outbox varre a cada 3 segundos porque o cliente está
//    esperando a resposta. A reserva só vira órfã depois de dois minutos —
//    conferir isso quarenta vezes por minuto é consulta ao banco para nada.
// 2. **Exclusividade.** Com dois workers, o poller faria os dois varrerem as
//    mesmas linhas ao mesmo tempo. O pg-boss entrega o job a um só.
//
// O nome da fila já existia em `fila.ts` desde a Fase C, declarado e sem
// consumidor: era exatamente este o expirador que ele esperava.

import { prisma, runWithTenant } from "@atende/db";
import type PgBoss from "pg-boss";

import { FILAS, obterFila } from "../fila.js";
import { listarEnviosExpirados } from "./plataforma.js";
import { LEASE_ENVIO_MS } from "./lease.js";

/** De quanto em quanto tempo procurar órfã. */
const CRON_A_CADA_MINUTO = "* * * * *";

/**
 * Marca como `falhou` toda reserva que estourou o teto.
 *
 * A marcação é condicional e repete o filtro da leitura: se a mensagem terminou
 * de sair entre uma coisa e outra, o `updateMany` não encontra nada e o envio
 * bem-sucedido fica de pé.
 *
 * Vira `falhou`, e não `pendente`, porque reenviar sozinho poderia duplicar
 * mensagem já entregue — o raciocínio inteiro está em `lease.ts`.
 */
export async function fecharReservasOrfas(agora = new Date()): Promise<number> {
  const limite = new Date(agora.getTime() - LEASE_ENVIO_MS);
  const orfas = await listarEnviosExpirados(limite);
  if (orfas.length === 0) return 0;

  let fechadas = 0;
  for (const o of orfas) {
    await runWithTenant({ empresaId: o.empresaId }, async () => {
      const r = await prisma.mensagem.updateMany({
        where: {
          id: o.id,
          statusEntrega: "enviando",
          OR: [{ envioReservadoEm: null }, { envioReservadoEm: { lt: limite } }],
        },
        data: { statusEntrega: "falhou" },
      });
      if (r.count > 0) {
        fechadas += r.count;
        console.error(
          `[expirar-envios] reserva órfã fechada (mensagem ${o.id}): o envio não confirmou em ${LEASE_ENVIO_MS}ms`,
        );
      }
    });
  }
  return fechadas;
}

export async function iniciarConsumerExpirarEnvios(): Promise<void> {
  const fila = obterFila();

  await fila.work(FILAS.expirarEnvios, { batchSize: 1 }, async (jobs: PgBoss.Job[]) => {
    // O job não carrega dado: a pergunta é sempre a mesma, "o que estourou o
    // teto agora". O laço existe só porque a v10 entrega um array.
    for (const _ of jobs) await fecharReservasOrfas();
  });

  // Idempotente: reagendar a mesma fila atualiza o agendamento em vez de criar
  // outro, então subir dois workers não dobra a varredura.
  await fila.schedule(FILAS.expirarEnvios, CRON_A_CADA_MINUTO);

  console.log("[worker] consumer expirar-envios ativo (a cada minuto)");
}
