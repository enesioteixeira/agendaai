import { describe, expect, it } from "vitest";

import { cabeNoTeto, descreverMidiaBaileys } from "./midia";
import type { WAMessage } from "./socket";

const msg = (message: unknown): WAMessage =>
  ({ key: { remoteJid: "551199@s.whatsapp.net", id: "X" }, message }) as WAMessage;

const TETO = 25 * 1024 * 1024;

describe("descrição da mídia", () => {
  it("não vê arquivo em mensagem de texto", () => {
    expect(descreverMidiaBaileys(msg({ conversation: "oi" }))).toBeNull();
    expect(descreverMidiaBaileys(msg(null))).toBeNull();
  });

  it("lê imagem, áudio e vídeo pelo mimetype declarado", () => {
    expect(descreverMidiaBaileys(msg({ imageMessage: { mimetype: "image/jpeg" } }))?.mimeType).toBe(
      "image/jpeg",
    );
    expect(descreverMidiaBaileys(msg({ audioMessage: { mimetype: "audio/ogg" } }))?.mimeType).toBe(
      "audio/ogg",
    );
    expect(descreverMidiaBaileys(msg({ videoMessage: { mimetype: "video/mp4" } }))?.mimeType).toBe(
      "video/mp4",
    );
  });

  it("guarda o nome só do documento — é o único tipo que traz um", () => {
    const doc = descreverMidiaBaileys(
      msg({ documentMessage: { mimetype: "application/pdf", fileName: "contrato.pdf" } }),
    );
    expect(doc?.nomeArquivo).toBe("contrato.pdf");
    expect(descreverMidiaBaileys(msg({ imageMessage: {} }))?.nomeArquivo).toBeUndefined();
  });

  /**
   * Mídia sem mimetype existe. Cair em octet-stream é o que faz o painel
   * oferecer download em vez de tentar renderizar algo que não sabe o que é.
   */
  it("cai em octet-stream quando a origem não declara o tipo", () => {
    expect(descreverMidiaBaileys(msg({ documentMessage: {} }))?.mimeType).toBe(
      "application/octet-stream",
    );
  });

  /** `fileLength` chega como Long do protobuf em parte dos payloads. */
  it("entende tamanho tanto como número quanto como Long", () => {
    expect(
      descreverMidiaBaileys(msg({ imageMessage: { fileLength: 2048 } }))?.tamanhoDeclaradoBytes,
    ).toBe(2048);
    expect(
      descreverMidiaBaileys(
        msg({ imageMessage: { fileLength: { toString: () => "4096" } } }),
      )?.tamanhoDeclaradoBytes,
    ).toBe(4096);
    expect(
      descreverMidiaBaileys(msg({ imageMessage: {} }))?.tamanhoDeclaradoBytes,
    ).toBe(0);
  });
});

describe("teto antes do download", () => {
  it("recusa cedo o que a origem declara acima do teto", () => {
    const grande = { mimeType: "video/mp4", tamanhoDeclaradoBytes: TETO + 1 };
    expect(cabeNoTeto(grande, TETO)).toBe(false);
  });

  it("aceita o que cabe, inclusive exatamente no limite", () => {
    expect(cabeNoTeto({ mimeType: "image/png", tamanhoDeclaradoBytes: TETO }, TETO)).toBe(true);
    expect(cabeNoTeto({ mimeType: "image/png", tamanhoDeclaradoBytes: 10 }, TETO)).toBe(true);
  });

  /**
   * O WhatsApp nem sempre declara tamanho. Recusar por omissão descartaria
   * mídia legítima — quem mede bytes de verdade é o armazenamento, depois.
   */
  it("não recusa por omissão de tamanho", () => {
    expect(cabeNoTeto({ mimeType: "image/png", tamanhoDeclaradoBytes: 0 }, TETO)).toBe(true);
  });
});
