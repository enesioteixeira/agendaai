// Conector Telegram (doc 05 §1) — Bot API por HTTP puro, sem SDK.
//
// A Bot API e REST simples e estavel; um SDK aqui traria dependencia e
// superficie de manutencao para muito pouco. E o unico canal do produto que
// TEM botoes nativos confiaveis, o que faz dele o melhor lugar para exercitar
// o caminho de botao antes de a API oficial da Meta chegar.
//
// ⚠️ PROATIVO NAO EXISTE AQUI, e nao por limitacao tecnica: o Telegram so
// permite a um bot escrever para quem ja falou com ele (`/start`), o que
// coincide com a regra inviolavel 12. `capacidades.templates` fica `false` e a
// interface nao expoe caminho proativo.

import type { MensagemInboundNormalizada, MensagemOutbound } from "@atende/core";
import type { CapacidadesCanal, Conector } from "../tipos";

export const capacidadesTelegram: CapacidadesCanal = {
  botoes: true, // inline keyboard — nativo e confiável
  listas: false, // não existe equivalente; degrada para lista numerada
  templates: false, // NUNCA true — proativo não existe neste canal (regra 12)
  midia: ["imagem", "audio", "video", "documento"],
  typing: true,
};

/** Envelope de update da Bot API (só o que consumimos). */
interface UpdateTelegram {
  update_id?: number;
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    caption?: string;
    chat?: { id?: number; type?: string };
    from?: { id?: number; is_bot?: boolean };
    photo?: unknown[];
    voice?: unknown;
    audio?: unknown;
    video?: unknown;
    document?: unknown;
    reply_to_message?: { message_id?: number };
  };
  callback_query?: {
    id?: string;
    data?: string;
    message?: { message_id?: number; chat?: { id?: number } };
    from?: { id?: number; is_bot?: boolean };
  };
}

function tipoDaMensagem(m: NonNullable<UpdateTelegram["message"]>): MensagemInboundNormalizada["tipo"] {
  if (m.photo) return "imagem";
  if (m.voice || m.audio) return "audio";
  if (m.video) return "video";
  if (m.document) return "documento";
  return "texto";
}

/**
 * Update bruto → formato canônico.
 *
 * `empresaId`/`canalId` vêm do REGISTRO do canal (a rota do webhook sabe de
 * quem é o bot), nunca do payload — regra inviolável 3 aplicada ao inbound,
 * igual ao Baileys e ao Meta.
 */
export function normalizarInboundTelegram(
  empresaId: string,
  canalId: string,
  update: unknown,
): MensagemInboundNormalizada | null {
  const u = update as UpdateTelegram | null;
  if (!u || typeof u !== "object") return null;

  // Clique em botão: vira mensagem de texto com o payload do botão. É o que
  // permite ao motor tratar botão e digitação pelo mesmo caminho — a
  // degradação (lista numerada) produz exatamente o mesmo texto.
  if (u.callback_query) {
    const cq = u.callback_query;
    const chatId = cq.message?.chat?.id;
    if (!chatId || !cq.data || !cq.id) return null;
    return {
      empresaId,
      canalId,
      identidadeExterna: { tipo: "telegram_id", valor: String(chatId) },
      tipo: "interativo",
      texto: cq.data,
      midia: [],
      // O id do callback é único por clique: usá-lo como idExterno faz o
      // dedup funcionar sem confundir dois cliques no mesmo botão.
      idExterno: `cb:${cq.id}`,
      timestamp: new Date(),
    };
  }

  const m = u.message;
  if (!m) return null;

  // Bot escrevendo para bot não entra no funil.
  if (m.from?.is_bot) return null;
  // Grupo e canal ficam de fora, como no Baileys — só conversa 1:1 (`private`).
  if (m.chat?.type && m.chat.type !== "private") return null;

  const chatId = m.chat?.id;
  const messageId = m.message_id;
  if (!chatId || messageId === undefined) return null;

  const texto = m.text ?? m.caption;
  const tipo = tipoDaMensagem(m);
  // Texto vazio só descarta mensagem de texto — mídia sem legenda é legítima.
  if (!texto && tipo === "texto") return null;

  return {
    empresaId,
    canalId,
    identidadeExterna: { tipo: "telegram_id", valor: String(chatId) },
    tipo,
    ...(texto ? { texto } : {}),
    // O download da mídia depende do R2 (bloqueado — doc 11): por ora a
    // mensagem entra com o tipo certo e sem binário, e a timeline diz o que é.
    midia: [],
    idExterno: String(messageId),
    ...(m.reply_to_message?.message_id
      ? { respostaA: String(m.reply_to_message.message_id) }
      : {}),
    timestamp: m.date ? new Date(m.date * 1000) : new Date(),
  };
}

export interface ConfigTelegram {
  /** Token do BotFather. Guardado cifrado em `Canal.configCifrada`. */
  readonly token: string;
  readonly fetch?: typeof globalThis.fetch;
}

export function criarConectorTelegram(
  cfg: ConfigTelegram,
  destinoChatId: (mensagem: MensagemOutbound) => Promise<string>,
): Conector {
  const http = cfg.fetch ?? globalThis.fetch;
  const base = `https://api.telegram.org/bot${cfg.token}`;

  return {
    tipo: "telegram",
    capacidades: capacidadesTelegram,

    async receber(): Promise<MensagemInboundNormalizada[]> {
      throw new Error(
        "O inbound do Telegram é normalizado na rota do webhook (normalizarInboundTelegram).",
      );
    },

    async enviar(mensagem: MensagemOutbound): Promise<{ idExterno: string }> {
      if (mensagem.templateProativo) {
        // Defesa em profundidade: o schema permite o campo (canal oficial usa),
        // mas aqui é bug de chamada — o Telegram não tem proativo (regra 12).
        throw new Error("Envio proativo não existe no canal Telegram (regra inviolável 12).");
      }

      const chatId = await destinoChatId(mensagem);
      const botoes = mensagem.botoes ?? [];

      const corpo: Record<string, unknown> = {
        chat_id: chatId,
        text: mensagem.texto,
        ...(botoes.length > 0
          ? {
              // Uma coluna: rótulo de botão em duas colunas fica truncado no
              // celular, que é onde a esmagadora maioria lê.
              reply_markup: {
                inline_keyboard: botoes.map((b) => [
                  { text: b.rotulo, callback_data: b.payload },
                ]),
              },
            }
          : {}),
      };

      const resp = await http(`${base}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });

      const json = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        result?: { message_id?: number };
        description?: string;
      } | null;

      if (!resp.ok || !json?.ok) {
        throw new Error(`Telegram recusou o envio: ${json?.description ?? resp.status}`);
      }

      return { idExterno: String(json.result?.message_id ?? "") };
    },
  };
}
