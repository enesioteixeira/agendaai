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

const { cifrarSegredo } = cryptoCore;

interface EntradaSocket {
  socket: WASocket;
  conector: Conector;
  empresaId: string;
  tentativas: number;
  encerrado: boolean; // remoção intencional — não reconectar
}

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
        configCifrada: qrDataUrl ? cifrarSegredo(JSON.stringify({ qrDataUrl })) : null,
      },
    }),
  ).catch((e) => console.error(`[gestor] status ${canalId}:`, e));
}

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
  };
  sockets.set(canalId, entrada);

  const socket = criarSocketBaileys(state, salvarCreds, {
    aoQr(qr) {
      void QRCode.toDataURL(qr).then((dataUrl) =>
        atualizarStatusCanal(empresaId, canalId, "pareando", dataUrl),
      );
    },
    aoConectar() {
      entrada.tentativas = 0;
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
      console.warn(`[gestor] canal ${canalId} caiu — reconectando em ${espera}ms`);
      setTimeout(() => {
        void abrirSocket(empresaId, canalId);
      }, espera);
    },
    aoMensagens(mensagens) {
      for (const msg of mensagens) {
        const normalizada = normalizarInboundBaileys(empresaId, canalId, msg);
        if (normalizada) {
          processarInbound(normalizada).catch((e) =>
            console.error(`[gestor] inbound ${canalId}:`, e),
          );
        }
      }
    },
  });

  entrada.socket = socket;
  entrada.conector = criarConectorBaileys(socket, async (m: MensagemOutbound) => {
    // destino = telefone da identidade da conversa → JID
    const conversa = await runWithTenant({ empresaId: m.empresaId }, () =>
      prisma.conversa.findUnique({
        where: { id: m.conversaId },
        include: { identidade: true },
      }),
    );
    const valor = conversa?.identidade.valor ?? "";
    return `${valor.replace(/^\+/, "")}@s.whatsapp.net`;
  });
}

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

/** Reconciliação: abre canais novos, fecha removidos. Chamada em loop. */
export async function reconciliarSockets(): Promise<void> {
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
}

export function iniciarGestorSockets(intervaloMs = 15_000): void {
  void reconciliarSockets();
  setInterval(() => {
    void reconciliarSockets();
  }, intervaloMs);
}
