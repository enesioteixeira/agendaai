// Gestor de sockets Baileys multi-tenant (doc 08 §3.2: o socket GLOBAL do
// ev-tracker vira Map<canalId, socket>). Reconciliação: a cada 15s compara os
// canais whatsapp_baileys ativos (leitura de plataforma) com o Map — abre o
// que falta, derruba o que sobrou. Reconexão com backoff 2s×tentativas (teto
// 30s). QR de pareamento: cifrado em Canal.configCifrada + status=pareando —
// o painel decifra e exibe.

import { crypto as cryptoCore, type MensagemOutbound } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import {
  montarAuthState,
  criarSocketBaileys,
  criarConectorBaileys,
  normalizarInboundBaileys,
  type WASocket,
  type Conector,
} from "@atende/canais";
import QRCode from "qrcode";
import { criarArmazenamentoAuthPg, limparAuthState } from "./auth-state-pg.js";
import { listarCanaisBaileys } from "../consumers/plataforma.js";
import { processarInbound } from "../consumers/inbound.js";
import { aplicarRecibos } from "../consumers/recibos.js";
import { ehZumbi } from "./vigia.js";

const { cifrarSegredo } = cryptoCore;

interface EntradaSocket {
  socket: WASocket;
  conector: Conector;
  empresaId: string;
  tentativas: number;
  encerrado: boolean; // remoção intencional — não reconectar
  conectado: boolean;
  /**
   * Último sinal de vida do socket: conexão aberta, QR emitido ou mensagem
   * recebida. É o que o watchdog usa para separar um socket TRAVADO de um que
   * está apenas esperando alguém escanear o QR — este emite QR de tempos em
   * tempos, aquele fica em silêncio total.
   */
  ultimoSinal: number;
  /**
   * O socket já chegou a emitir QR alguma vez nesta vida?
   *
   * Separa "não pareou ainda" de "não CONSEGUE parear". Sem QR e sem conexão
   * depois de várias quedas, o socket não está esperando ninguém escanear — ele
   * está sendo recusado, e a tela precisa dizer isso.
   */
  recebeuQr: boolean;
}

/**
 * O caso que o watchdog cobre: o Baileys pode travar sem emitir
 * `connection.update`, e aí o canal fica no Map, o painel mostra o status
 * antigo, e nenhuma mensagem entra nem sai — o pior tipo de falha, porque
 * parece que está funcionando. Como `aoFechar` remove a entrada do Map, um
 * socket que caiu de verdade nem chega ao watchdog: sobra exatamente o travado.
 *
 * A regra em si mora em `vigia.ts` (pura, testada).
 */

const sockets = new Map<string, EntradaSocket>();

async function atualizarStatusCanal(
  empresaId: string,
  canalId: string,
  status: "desconectado" | "pareando" | "conectado" | "erro",
  qrDataUrl?: string,
): Promise<void> {
  await runWithTenant({ empresaId }, () =>
    prisma.canal.update({
      where: { id: canalId },
      data: {
        statusConexao: status,
        statusAtualizadoEm: new Date(),
        configCifrada: qrDataUrl ? cifrarSegredo(JSON.stringify({ qrDataUrl })) : null,
      },
    }),
  ).catch((e) => console.error(`[gestor] status ${canalId}:`, e));
}

/**
 * Quedas seguidas, sem nunca ter chegado ao QR, antes de chamar de erro.
 *
 * O número separa duas coisas que se parecem no log e não se parecem em nada na
 * prática: a queda passageira, que reconecta na primeira ou segunda tentativa,
 * e o socket que o servidor recusa toda vez — versão de cliente velha,
 * bloqueio, rede filtrada. A segunda não melhora esperando.
 */
const QUEDAS_ATE_CHAMAR_DE_ERRO = 5;

async function abrirSocket(empresaId: string, canalId: string): Promise<void> {
  const anterior = sockets.get(canalId);
  if (anterior) return;

  const armazenamento = criarArmazenamentoAuthPg(empresaId, canalId);
  const { state, salvarCreds } = await montarAuthState(armazenamento);

  const entrada: EntradaSocket = {
    socket: undefined as never,
    conector: undefined as never,
    empresaId,
    tentativas: 0,
    encerrado: false,
    conectado: false,
    recebeuQr: false,
    ultimoSinal: Date.now(),
  };
  sockets.set(canalId, entrada);

  const socket = await criarSocketBaileys(state, salvarCreds, {
    aoQr(qr) {
      entrada.ultimoSinal = Date.now();
      entrada.recebeuQr = true;
      entrada.tentativas = 0;
      void QRCode.toDataURL(qr).then((dataUrl) =>
        atualizarStatusCanal(empresaId, canalId, "pareando", dataUrl),
      );
    },
    aoConectar() {
      entrada.tentativas = 0;
      entrada.conectado = true;
      entrada.ultimoSinal = Date.now();
      void atualizarStatusCanal(empresaId, canalId, "conectado");
      console.log(`[gestor] canal ${canalId} conectado`);
    },
    aoFechar(deveReconectar) {
      sockets.delete(canalId);
      if (entrada.encerrado) return;
      if (!deveReconectar) {
        // deslogado do celular: limpar sessão e voltar a parear
        console.warn(`[gestor] canal ${canalId} deslogado — limpando sessão`);
        void limparAuthState(empresaId, canalId).then(() =>
          atualizarStatusCanal(empresaId, canalId, "desconectado"),
        );
        return;
      }
      const espera = Math.min(2000 * ++entrada.tentativas, 30_000);

      // Nunca chegou ao QR nem à conexão, e já caiu vezes demais: isto não é
      // queda passageira, é recusa. Marcar `erro` é o que transforma um log
      // infinito de "caiu — reconectando" numa tela que diz o que houve — a
      // ausência disso escondeu um 405 por versão de cliente velha durante uma
      // sessão inteira de depuração.
      if (
        !entrada.conectado &&
        !entrada.recebeuQr &&
        entrada.tentativas >= QUEDAS_ATE_CHAMAR_DE_ERRO
      ) {
        console.error(
          `[gestor] canal ${canalId}: ${entrada.tentativas} quedas sem nunca emitir QR — ` +
            `o servidor está recusando a conexão. Marcando o canal como erro.`,
        );
        void atualizarStatusCanal(empresaId, canalId, "erro");
      }

      console.warn(`[gestor] canal ${canalId} caiu — reconectando em ${espera}ms`);
      setTimeout(() => {
        void abrirSocket(empresaId, canalId);
      }, espera);
    },
    aoMensagens(mensagens) {
      entrada.ultimoSinal = Date.now();
      for (const msg of mensagens) {
        const normalizada = normalizarInboundBaileys(empresaId, canalId, msg);
        if (normalizada) {
          processarInbound(normalizada).catch((e) =>
            console.error(`[gestor] inbound ${canalId}:`, e),
          );
        }
      }
    },
    aoRecibos(recibos) {
      aplicarRecibos(empresaId, recibos).catch((e) =>
        console.error(`[gestor] recibos ${canalId}:`, e),
      );
    },
  });

  entrada.socket = socket;
  entrada.conector = criarConectorBaileys(socket, async (m: MensagemOutbound) => {
    // destino = identidade da conversa → JID. Telefone "+55..." vira
    // "55...@s.whatsapp.net"; identidade opaca "lid:123" vira "123@lid".
    const conversa = await runWithTenant({ empresaId: m.empresaId }, () =>
      prisma.conversa.findUnique({
        where: { id: m.conversaId },
        include: { identidade: true },
      }),
    );
    const valor = conversa?.identidade.valor ?? "";
    if (valor.startsWith("lid:")) return `${valor.slice(4)}@lid`;
    return `${valor.replace(/^\+/, "")}@s.whatsapp.net`;
  });
}

// O diagnóstico de inbound em arquivo foi REMOVIDO (2026-08-17). Ele gravava a
// `key` bruta de toda mensagem — incluindo telefone de cliente — num arquivo sem
// rotação nem limite, em texto claro, para todos os tenants. Existia para
// investigar por que inbound não virava conversa; a causa foi encontrada e
// corrigida (status/story admitido como conversa por causa de `remoteJidAlt`),
// está registrada no doc 11 e presa por teste em
// `packages/canais/src/baileys/conector.test.ts`. Diagnóstico que sobrevive ao
// bug que o motivou vira vazamento.

function fecharSocket(canalId: string): void {
  const entrada = sockets.get(canalId);
  if (!entrada) return;
  entrada.encerrado = true;
  sockets.delete(canalId);
  try {
    entrada.socket.end(undefined as never);
  } catch {
    // socket já morto
  }
}

/** Conector vivo do canal (p/ o consumer de envio). */
export function conectorDoCanal(canalId: string): Conector | null {
  return sockets.get(canalId)?.conector ?? null;
}

/** Quantos canais têm socket aberto agora — para o /healthz. */
export function totalDeSockets(): number {
  return sockets.size;
}

let reconciliadoEm: number | null = null;

/**
 * Instante da última reconciliação bem-sucedida.
 *
 * O `/healthz` usa isto para distinguir "worker vivo" de "worker útil": o laço
 * roda a cada 15 s, então silêncio longo aqui significa que ele travou — e um
 * processo travado responde 200 alegremente.
 */
export function ultimaReconciliacao(): number | null {
  return reconciliadoEm;
}

/**
 * Watchdog: derruba sockets travados para que a reconciliação os reabra.
 *
 * Diferente do watchdog do ev-tracker, que mata o PROCESSO (`process.exit(1)`)
 * e deixa o host reiniciar — lá existe um socket só, aqui existe um por tenant.
 * Matar o processo por causa de um canal zumbi derrubaria o atendimento de
 * todos os outros, que estão perfeitamente vivos.
 *
 * Reabrir é seguro: `fecharSocket` marca `encerrado` (para o `aoFechar` não
 * agendar uma reconexão concorrente) e a reconciliação seguinte, em ≤15 s, abre
 * de novo lendo o auth-state do Postgres. A sessão pareada sobrevive.
 */
function derrubarZumbis(agora = Date.now()): void {
  for (const [canalId, entrada] of sockets) {
    if (!ehZumbi(entrada, agora)) continue;
    console.warn(
      `[gestor] canal ${canalId} sem sinal há ${Math.round((agora - entrada.ultimoSinal) / 1000)}s e sem conectar — derrubando para reabrir`,
    );
    fecharSocket(canalId);
  }
}

/** Reconciliação: abre canais novos, fecha removidos, derruba travados. */
export async function reconciliarSockets(): Promise<void> {
  derrubarZumbis();

  const canais = await listarCanaisBaileys();
  const desejados = new Set(canais.map((c) => c.id));

  for (const canal of canais) {
    if (!sockets.has(canal.id)) {
      console.log(`[gestor] abrindo socket do canal ${canal.id} (${canal.nome})`);
      await abrirSocket(canal.empresaId, canal.id).catch((e) =>
        console.error(`[gestor] abrir ${canal.id}:`, e),
      );
    }
  }
  for (const canalId of sockets.keys()) {
    if (!desejados.has(canalId)) {
      console.log(`[gestor] fechando socket removido ${canalId}`);
      fecharSocket(canalId);
    }
  }

  // Marcado só no fim, e só em sucesso: se `listarCanaisBaileys` falhar, o laço
  // sai por exceção e o timestamp fica velho — que é exatamente o sinal que o
  // /healthz precisa para acusar worker travado.
  reconciliadoEm = Date.now();
}

/**
 * Devolve a função de parada: cancela a reconciliação e fecha todos os sockets.
 *
 * Fechar os sockets no encerramento evita deixar a sessão do WhatsApp pendurada
 * do lado do servidor da Meta — o que atrasa a reconexão no próximo boot.
 */
export function iniciarGestorSockets(intervaloMs = 15_000): () => void {
  void reconciliarSockets();
  const id = setInterval(() => {
    void reconciliarSockets();
  }, intervaloMs);

  return () => {
    clearInterval(id);
    for (const canalId of [...sockets.keys()]) fecharSocket(canalId);
  };
}
