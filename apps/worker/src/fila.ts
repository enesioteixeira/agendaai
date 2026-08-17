// A fila do worker (pg-boss sobre o mesmo Postgres).
//
// POR QUE ISTO EXISTE AGORA. O pg-boss já era iniciado no bootstrap e mantido
// vivo **sem uma única fila**: criava o schema `pgboss` no Neon e rodava as
// queries de manutenção em laço, para sempre, sem entregar nada. Era custo de
// banco puro. A decisão honesta era usar ou parar — e o turno de IA é
// exatamente o caso de uso que justifica ter fila (doc 12 §2.2).
//
// POR QUE FILA E NÃO POLLER, para o turno de IA:
//  - `singletonKey: conversaId` impede dois turnos concorrentes na mesma
//    conversa. Sem isso, duas mensagens do cliente em 2 s viram dois turnos que
//    criam duas `PropostaAcao` — e a segunda estoura o índice parcial
//    `uma_pendente_por_conversa` com P2002 no meio de uma venda.
//  - `retryLimit` + `retryBackoff` para o 429 do provedor, que é rotina.
//  - `expireInSeconds` contra turno pendurado (um poller o deixaria pendurado).
//  - `schedule(cron)` de graça para os expiradores.
//
// O OUTBOX CONTINUA POLLER, de propósito: funciona, é o caminho humano, e
// trocá-lo agora seria risco sem retorno.

import PgBoss from "pg-boss";

/** Nomes das filas. Constante para o enqueue e o work não divergirem por typo. */
export const FILAS = {
  iaTurno: "ia-turno",
  expirarPropostas: "expirar-propostas",
  expirarEnvios: "expirar-envios",
} as const;

let instancia: PgBoss | null = null;

/**
 * Sobe o pg-boss e declara as filas.
 *
 * Na v10 `createQueue` é obrigatório antes de `send`/`work` — enfileirar numa
 * fila não declarada falha em runtime, e falharia justamente no primeiro
 * cliente real.
 */
export async function iniciarFila(connectionString: string): Promise<PgBoss> {
  if (instancia) return instancia;

  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (err) => console.error("[fila] pg-boss error:", err));
  await boss.start();

  await boss.createQueue(FILAS.iaTurno, {
    name: FILAS.iaTurno,
    policy: "standard",
    // 2 tentativas: o 429 costuma passar; erro de credencial não passa nunca, e
    // insistir só queima orçamento do tenant.
    retryLimit: 2,
    retryBackoff: true,
    // Acima do ORCAMENTO_IA_MS (40 s) com folga para persistir a resposta.
    expireInSeconds: 90,
    retentionMinutes: 60 * 24,
  });
  await boss.createQueue(FILAS.expirarPropostas, { name: FILAS.expirarPropostas });
  await boss.createQueue(FILAS.expirarEnvios, { name: FILAS.expirarEnvios });

  instancia = boss;
  return boss;
}

/**
 * A fila viva, ou erro.
 *
 * Fail-closed de propósito: devolver `null` faria o chamador "seguir sem
 * enfileirar", e a mensagem do cliente sumiria em silêncio — o modo de falha
 * mais caro que existe num produto de atendimento.
 */
export function obterFila(): PgBoss {
  if (!instancia) {
    throw new Error("Fila não iniciada — chame iniciarFila() no bootstrap antes de enfileirar.");
  }
  return instancia;
}

/** `true` quando há fila utilizável — para o /healthz dizer se está útil. */
export function filaAtiva(): boolean {
  return instancia !== null;
}

export async function pararFila(): Promise<void> {
  if (!instancia) return;
  // `graceful` espera os jobs em andamento terminarem: parar no meio de um
  // turno de IA deixaria o cliente sem resposta e o job sem retry.
  await instancia.stop({ graceful: true });
  instancia = null;
}
