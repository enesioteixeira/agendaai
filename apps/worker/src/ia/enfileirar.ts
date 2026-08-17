// Enfileiramento do turno de IA.
//
// Separado do consumer de propósito: quem enfileira é o `inbound`, que roda no
// callback do socket, e não deve conhecer o consumo — nem carregar os SDKs de
// modelo junto.

import { z } from "zod";

import { FILAS, obterFila } from "../fila.js";

/**
 * Contrato do job — validado no enqueue E no consumo (regra 14).
 *
 * O payload carrega só IDENTIFICADORES. Nada de texto da mensagem: o consumer
 * relê tudo do banco sob `runWithTenant`, então um payload adulterado não
 * consegue injetar conteúdo no turno, e um job antigo nunca reprocessa um
 * estado que já mudou.
 */
export const jobIaTurnoSchema = z.object({
  empresaId: z.string().min(1),
  conversaId: z.string().min(1),
  mensagemId: z.string().min(1),
});

export type JobIaTurno = z.infer<typeof jobIaTurnoSchema>;

export async function enfileirarTurnoIA(job: JobIaTurno): Promise<void> {
  const valido = jobIaTurnoSchema.parse(job);

  await obterFila().send(FILAS.iaTurno, valido, {
    // Duas mensagens do cliente em sequência não podem virar dois turnos
    // concorrentes: os dois criariam `PropostaAcao` e o segundo estouraria o
    // índice parcial `uma_pendente_por_conversa` no meio de uma venda.
    //
    // ⚠️ `singletonKey` deduplica jobs em `created`; um job já `active` NÃO
    // bloqueia um novo. Por isso o consumer também tem guarda de idempotência
    // própria — esta é a primeira barreira, não a única.
    singletonKey: valido.conversaId,
  });
}
