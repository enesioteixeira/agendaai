// Envio outbox (doc 01: eventos via outbox): o painel grava a Mensagem de
// saída como `pendente` NA MESMA transação do que a originou — a tabela
// Mensagem é a outbox. Este poller varre pendentes de canais Baileys, faz um
// CLAIM atômico por tenant e envia pelo conector do socket vivo. pg-boss segue
// reservado aos jobs dos motores (Bloco 4) — o caminho humano não precisa de fila.
//
// O claim reserva em `enviando` e só promove a `enviada` quando o conector
// devolve o identificador externo. Antes havia um estado só para as duas
// coisas: a mensagem era marcada `enviada` ANTES do envio, e morrer no meio
// deixava ✓ na tela do atendente sem nada ter saído. A reserva órfã — worker
// que não voltou — é fechada pela fila agendada `expirar-envios`, não por esta
// varredura: ela roda a cada 3 segundos porque o cliente espera resposta, e
// conferir um teto de dois minutos quarenta vezes por minuto seria consulta ao
// banco para nada.

import { prisma, registrarPrimeiraResposta, runWithTenant } from "@atende/db";
import { conectorDoCanal } from "../sockets/gestor.js";
import { listarMensagensPendentesBaileys } from "./plataforma.js";
import { MAX_TENTATIVAS, deveTentarDeNovo, esperaDaTentativa } from "./reenvio.js";

const dormir = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function enviarUma(m: {
  id: string;
  empresaId: string;
  canalId: string;
  conversaId: string;
  texto: string | null;
}): Promise<void> {
  await runWithTenant({ empresaId: m.empresaId }, async () => {
    // Claim atômico: só um worker ganha a mensagem. O carimbo da reserva sai
    // junto, na mesma escrita — reserva sem carimbo é órfã que ninguém acha.
    const claim = await prisma.mensagem.updateMany({
      where: { id: m.id, statusEntrega: "pendente" },
      data: { statusEntrega: "enviando", envioReservadoEm: new Date() },
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
    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
      const espera = esperaDaTentativa(tentativa);
      if (espera > 0) await dormir(espera);

      try {
        const { idExterno } = await conector.enviar({
          empresaId: m.empresaId,
          canalId: m.canalId,
          conversaId: m.conversaId,
          texto: m.texto ?? "",
        });

        // Status e identificador externo entram na MESMA escrita.
        //
        // O idExterno é o que amarra o recibo de entrega (✓✓ / lida) a esta
        // linha. Gravá-lo depois de a mensagem já constar como `enviada` abria
        // uma janela em que o recibo chegava e não encontrava a quem pertencia
        // — o ack era descartado e a mensagem parava no primeiro check para
        // sempre.
        await prisma.mensagem.update({
          where: { id: m.id },
          data: { statusEntrega: "enviada", idExterno },
        });

        // O prazo de primeira resposta fecha AQUI, quando a mensagem
        // efetivamente saiu — não quando o atendente apertou enviar. É o
        // instante que o cliente viveu, e é ele que o relatório precisa
        // defender numa conversa sobre SLA.
        //
        // A função é idempotente e não retrocede: reenvio, recibo atrasado ou
        // segunda mensagem do mesmo atendente não reescrevem o instante.
        try {
          await registrarPrimeiraResposta(m.conversaId, new Date());
        } catch (e) {
          console.error(`[outbox] primeira resposta não registrada (${m.conversaId}):`, e);
        }
        return;
      } catch (e) {
        ultimoErro = e;
        if (!deveTentarDeNovo(tentativa, e)) break;
        console.warn(
          `[outbox] tentativa ${tentativa + 1}/${MAX_TENTATIVAS} falhou (mensagem ${m.id}):`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    console.error(`[outbox] envio falhou (mensagem ${m.id}):`, ultimoErro);
    await prisma.mensagem.update({
      where: { id: m.id },
      data: { statusEntrega: "falhou" },
    });
  });
}

/** Devolve a função de parada — o bootstrap a usa no encerramento gracioso. */
export function iniciarOutboxEnvio(intervaloMs = 3_000): () => void {
  let rodando = false;
  const id = setInterval(() => {
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

  return () => clearInterval(id);
}
