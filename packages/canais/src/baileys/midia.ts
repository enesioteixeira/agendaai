// Mídia de entrada do Baileys: descrever, decidir e baixar.
//
// A descrição é pura e a decisão também. Só o download toca a rede, e ele é a
// última coisa que acontece — de propósito.
//
// **Por que o teto é conferido ANTES de baixar.** Quem escolhe o que chega é o
// cliente do nosso cliente: ninguém do nosso lado controla o tamanho. Baixar
// para depois recusar significaria carregar um vídeo de 300 MB na memória de um
// worker que atende todos os tenants — a recusa chegaria tarde demais para
// servir de proteção. O WhatsApp declara `fileLength` no payload, então dá para
// recusar antes de gastar rede e memória.
//
// O `fileLength` é declarado pela origem e não é confiável como verdade: um
// remetente hostil pode mentir. Por isso ele **só é usado para recusar cedo**,
// nunca para aceitar — quem aceita de verdade é o teto do armazenamento, que
// mede os bytes que chegaram.

import { downloadMediaMessage } from "@whiskeysockets/baileys";

import type { WAMessage } from "./socket";

/** O que o payload declara sobre o arquivo, antes de qualquer download. */
export interface DescricaoDeMidia {
  readonly mimeType: string;
  readonly nomeArquivo?: string | undefined;
  /** Declarado pela origem. Serve para recusar cedo, nunca para confiar. */
  readonly tamanhoDeclaradoBytes: number;
}

export type MotivoSemMidia = "sem-midia" | "acima-do-teto" | "download-falhou";

export type ResultadoDeMidia =
  | {
      readonly ok: true;
      readonly conteudo: Uint8Array;
      readonly tipoMime: string;
      readonly nomeOriginal?: string | undefined;
    }
  | { readonly ok: false; readonly motivo: MotivoSemMidia };

/**
 * O que o payload diz do arquivo — sem rede.
 *
 * Sticker fica de fora: o tipo canônico não o representa, e figurinha não é
 * anexo de atendimento. Localização e contato também não são arquivo.
 */
export function descreverMidiaBaileys(msg: WAMessage): DescricaoDeMidia | null {
  const m = msg.message;
  if (!m) return null;

  const conteudo =
    m.imageMessage ?? m.videoMessage ?? m.audioMessage ?? m.documentMessage ?? null;
  if (!conteudo) return null;

  const mimeType = conteudo.mimetype ?? "application/octet-stream";
  const nomeArquivo = m.documentMessage?.fileName ?? undefined;
  // `fileLength` vem como Long do protobuf em alguns casos, número em outros.
  const bruto = conteudo.fileLength;
  const tamanhoDeclaradoBytes =
    typeof bruto === "number" ? bruto : Number(bruto?.toString() ?? 0);

  return {
    mimeType,
    nomeArquivo,
    tamanhoDeclaradoBytes: Number.isFinite(tamanhoDeclaradoBytes)
      ? tamanhoDeclaradoBytes
      : 0,
  };
}

/**
 * O arquivo declarado cabe no teto?
 *
 * Tamanho declarado zero ou ausente devolve `true`: o WhatsApp nem sempre
 * informa, e recusar por omissão descartaria mídia legítima. O teto real, o que
 * mede bytes de verdade, continua no armazenamento — este aqui só evita o
 * download óbvio demais.
 */
export function cabeNoTeto(descricao: DescricaoDeMidia, tetoBytes: number): boolean {
  if (descricao.tamanhoDeclaradoBytes <= 0) return true;
  return descricao.tamanhoDeclaradoBytes <= tetoBytes;
}

export interface OpcoesDeDownload {
  readonly tetoBytes: number;
  /**
   * Reenvio do arquivo pelo servidor quando a mídia expirou.
   *
   * É `socket.updateMediaMessage`. Sem ele, mensagem antiga cujo arquivo já saiu
   * dos servidores do WhatsApp falha o download em vez de ser recuperada.
   */
  readonly reuploadRequest?: ((msg: WAMessage) => Promise<WAMessage>) | undefined;
}

/** Baixa os bytes. Nunca lança: quem chama precisa continuar com o texto. */
export async function baixarMidiaBaileys(
  msg: WAMessage,
  opcoes: OpcoesDeDownload,
): Promise<ResultadoDeMidia> {
  const descricao = descreverMidiaBaileys(msg);
  if (!descricao) return { ok: false, motivo: "sem-midia" };
  if (!cabeNoTeto(descricao, opcoes.tetoBytes)) return { ok: false, motivo: "acima-do-teto" };

  try {
    const buffer = await downloadMediaMessage(
      msg,
      "buffer",
      {},
      opcoes.reuploadRequest
        ? { reuploadRequest: opcoes.reuploadRequest, logger: silencioso }
        : undefined,
    );

    const conteudo = new Uint8Array(buffer);
    // Segunda conferência, agora sobre bytes reais. O `fileLength` é declarado
    // pela origem: quem mentiu no payload é barrado aqui.
    if (conteudo.byteLength > opcoes.tetoBytes) {
      return { ok: false, motivo: "acima-do-teto" };
    }

    return {
      ok: true,
      conteudo,
      tipoMime: descricao.mimeType,
      nomeOriginal: descricao.nomeArquivo,
    };
  } catch {
    // Mídia expirada, chave de descriptografia inválida, rede caída. A mensagem
    // continua entrando na inbox com o texto e o tipo — perder a conversa
    // inteira porque o anexo falhou seria o pior desfecho.
    return { ok: false, motivo: "download-falhou" };
  }
}

/**
 * Logger nulo no formato que o Baileys espera.
 *
 * O download não precisa de log próprio: o resultado sobe para quem chamou, que
 * já sabe de qual canal e de qual mensagem se trata. Um logger de verdade aqui
 * despejaria o payload da mídia — que é dado pessoal de terceiro — no stdout.
 */
const silencioso = {
  level: "silent",
  child: () => silencioso,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as never;
