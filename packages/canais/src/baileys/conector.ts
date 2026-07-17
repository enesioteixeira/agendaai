// Conector whatsapp_baileys (doc 05 §1): tradução WAMessage ⇄ formato
// canônico. SEM caminho proativo — capacidades.templates = false e a
// interface não expõe template (restrição ESTRUTURAL, regra inviolável 12):
// este conector só responde conversas iniciadas pelo cliente.

import type { MensagemInboundNormalizada, MensagemOutbound } from "@atende/core";
import type { CapacidadesCanal, Conector } from "../tipos";
import { botoesParaListaNumerada } from "../degradacao";
import type { WAMessage, WASocket } from "./socket";

export const capacidadesBaileys: CapacidadesCanal = {
  botoes: false, // reply buttons não são confiáveis fora da API oficial
  listas: false,
  templates: false, // NUNCA true — anti-ban (regra 12)
  midia: ["imagem", "audio", "video", "documento"],
  typing: true,
};

/** JID de usuário → E.164 ("+5511999998888"). Grupos/broadcast → null. */
export function jidParaTelefone(jid: string | null | undefined): string | null {
  if (!jid || !jid.endsWith("@s.whatsapp.net")) return null;
  const numero = jid.split("@")[0]?.split(":")[0] ?? "";
  return /^\d{10,15}$/.test(numero) ? `+${numero}` : null;
}

function extrairTexto(msg: WAMessage): string | undefined {
  const m = msg.message;
  if (!m) return undefined;
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    undefined
  );
}

function extrairTipo(msg: WAMessage): MensagemInboundNormalizada["tipo"] {
  const m = msg.message;
  if (m?.imageMessage) return "imagem";
  if (m?.audioMessage) return "audio";
  if (m?.videoMessage) return "video";
  if (m?.documentMessage) return "documento";
  if (m?.locationMessage) return "localizacao";
  if (m?.buttonsResponseMessage || m?.listResponseMessage) return "interativo";
  return "texto";
}

/**
 * WAMessage → canônico. Retorna null para o que NÃO entra no funil:
 * grupos, broadcast/status, mensagens próprias (fromMe) e payload vazio.
 * empresaId/canalId vêm do REGISTRO do socket (dono do canal), nunca do
 * payload (regra inviolável 3).
 */
export function normalizarInboundBaileys(
  empresaId: string,
  canalId: string,
  msg: WAMessage,
): MensagemInboundNormalizada | null {
  if (msg.key.fromMe) return null;
  const telefone = jidParaTelefone(msg.key.remoteJid);
  if (!telefone) return null; // grupo, status, newsletter — fora do MVP
  const idExterno = msg.key.id;
  if (!idExterno || !msg.message) return null;

  const texto = extrairTexto(msg);
  const tipo = extrairTipo(msg);
  if (!texto && tipo === "texto") return null; // protocolo/efêmera sem corpo

  const respostaA =
    msg.message.extendedTextMessage?.contextInfo?.stanzaId ?? undefined;
  const timestampBruto = Number(msg.messageTimestamp ?? 0);

  return {
    empresaId,
    canalId,
    identidadeExterna: { tipo: "telefone", valor: telefone },
    tipo,
    texto,
    midia: [], // download de mídia p/ R2 chega com o binding R2 (Bloco 3 tardio)
    idExterno,
    respostaA,
    timestamp: timestampBruto > 0 ? new Date(timestampBruto * 1000) : new Date(),
  };
}

/**
 * Conector de ENVIO amarrado a um socket vivo (injetado pelo gestor do
 * worker). `receber` não se aplica ao Baileys — inbound chega por evento de
 * socket, não por webhook (normalizarInboundBaileys é chamada direto).
 */
export function criarConectorBaileys(
  socket: WASocket,
  destinoJid: (mensagem: MensagemOutbound) => Promise<string>,
): Conector {
  return {
    tipo: "whatsapp_baileys",
    capacidades: capacidadesBaileys,

    async receber(): Promise<MensagemInboundNormalizada[]> {
      throw new Error(
        "Baileys não recebe por webhook — inbound chega por evento de socket (normalizarInboundBaileys).",
      );
    },

    async enviar(mensagem: MensagemOutbound): Promise<{ idExterno: string }> {
      if (mensagem.templateProativo) {
        // Defesa em profundidade: o schema permite o campo (canal oficial usa),
        // mas NESTE conector é bug de chamada — anti-ban, regra inviolável 12.
        throw new Error("Envio proativo não existe no canal Baileys (regra inviolável 12).");
      }
      // Degradação (doc 05 §1.3): botões/lista viram lista numerada no texto
      let texto = mensagem.texto;
      const opcoes = mensagem.botoes ?? mensagem.lista?.itens;
      if (opcoes && opcoes.length > 0) {
        texto = botoesParaListaNumerada(mensagem.texto, opcoes).texto;
      }
      const jid = await destinoJid(mensagem);
      const enviado = await socket.sendMessage(jid, { text: texto });
      return { idExterno: enviado?.key?.id ?? `sem-id-${Date.now()}` };
    },
  };
}
