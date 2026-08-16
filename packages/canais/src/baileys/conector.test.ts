import { describe, expect, it } from "vitest";

import type { WAMessage } from "./socket";
import { identidadeDeMensagem, jidParaTelefone, normalizarInboundBaileys } from "./conector";

/**
 * Os payloads deste arquivo são REAIS: saíram do `diag-inbound.log` gravado
 * pelo worker contra um WhatsApp de verdade em 17/07. Vale mais que payload
 * inventado — o formato do Baileys 7 com `addressingMode: "lid"` tem campos que
 * ninguém adivinharia (`remoteJidAlt` com telefone dentro de uma mensagem de
 * status é o melhor exemplo).
 */

function mensagem(key: Record<string, unknown>, message: unknown = { conversation: "oi" }): WAMessage {
  return { key, message, messageTimestamp: 1_752_777_600 } as unknown as WAMessage;
}

describe("identidade do remetente", () => {
  it("usa o telefone quando o endereçamento é por telefone", () => {
    const m = mensagem({
      remoteJid: "556292429151@s.whatsapp.net",
      fromMe: false,
      id: "ABC123",
      addressingMode: "pn",
    });
    expect(identidadeDeMensagem(m)).toBe("+556292429151");
  });

  it("prefere o telefone de remoteJidAlt quando a conversa é endereçada por LID", () => {
    // payload real: cliente novo do WhatsApp, endereçado por @lid
    const m = mensagem({
      remoteJid: "49328018215052@lid",
      remoteJidAlt: "551128475131@s.whatsapp.net",
      fromMe: false,
      id: "F344688DC98CD85915",
      participant: "",
      addressingMode: "lid",
    });
    expect(identidadeDeMensagem(m)).toBe("+551128475131");
  });

  it("cai para o LID opaco quando o WhatsApp não revela o telefone", () => {
    const m = mensagem({
      remoteJid: "49328018215052@lid",
      fromMe: false,
      id: "F344688DC98CD85915",
      addressingMode: "lid",
    });
    // O prefixo é o que impede a colisão com um E.164 na tabela de identidades.
    expect(identidadeDeMensagem(m)).toBe("lid:49328018215052");
  });
});

describe("o que NÃO entra no funil", () => {
  /**
   * O caso que motivou a correção. Antes, a busca pelo telefone vinha primeiro,
   * encontrava um em `remoteJidAlt` e admitia a mensagem: cada story de cada
   * contato da agenda virava conversa nova na inbox.
   */
  it("descarta status/stories, mesmo trazendo telefone válido em remoteJidAlt", () => {
    const status = mensagem(
      {
        remoteJid: "status@broadcast",
        remoteJidAlt: "5511911128569@s.whatsapp.net",
        fromMe: false,
        id: "A5A66C41196BA66B229DF33F8E97F4AC",
        participant: "276927176822971@lid",
        addressingMode: "lid",
      },
      { imageMessage: { caption: "story" } },
    );
    expect(identidadeDeMensagem(status)).toBeNull();
    expect(normalizarInboundBaileys("emp1", "can1", status)).toBeNull();
  });

  it("descarta grupo", () => {
    const m = mensagem({
      remoteJid: "123456-789@g.us",
      remoteJidAlt: "5511911128569@s.whatsapp.net",
      fromMe: false,
      id: "G1",
    });
    expect(normalizarInboundBaileys("emp1", "can1", m)).toBeNull();
  });

  it("descarta newsletter e lista de transmissão", () => {
    for (const jid of ["12345@newsletter", "12345@broadcast"]) {
      const m = mensagem({ remoteJid: jid, fromMe: false, id: "N1" });
      expect(normalizarInboundBaileys("emp1", "can1", m), jid).toBeNull();
    }
  });

  it("descarta a própria mensagem (fromMe)", () => {
    const m = mensagem({ remoteJid: "556292429151@s.whatsapp.net", fromMe: true, id: "M1" });
    expect(normalizarInboundBaileys("emp1", "can1", m)).toBeNull();
  });

  it("descarta protocolo/efêmera sem corpo", () => {
    const m = mensagem(
      { remoteJid: "556292429151@s.whatsapp.net", fromMe: false, id: "P1" },
      { protocolMessage: {} },
    );
    expect(normalizarInboundBaileys("emp1", "can1", m)).toBeNull();
  });
});

describe("normalização de mensagem admitida", () => {
  it("leva empresaId e canalId do REGISTRO, nunca do payload (regra 3)", () => {
    const m = mensagem({
      remoteJid: "556292429151@s.whatsapp.net",
      fromMe: false,
      id: "OK1",
    });
    const n = normalizarInboundBaileys("empresa-do-socket", "canal-do-socket", m);
    expect(n).toMatchObject({
      empresaId: "empresa-do-socket",
      canalId: "canal-do-socket",
      identidadeExterna: { tipo: "telefone", valor: "+556292429151" },
      tipo: "texto",
      texto: "oi",
      idExterno: "OK1",
    });
  });

  it("admite mídia sem legenda — o corpo vazio só descarta mensagem de texto", () => {
    const m = mensagem(
      { remoteJid: "556292429151@s.whatsapp.net", fromMe: false, id: "IMG1" },
      { imageMessage: {} },
    );
    expect(normalizarInboundBaileys("emp1", "can1", m)?.tipo).toBe("imagem");
  });
});

describe("jidParaTelefone (compatibilidade)", () => {
  it("só aceita JID de telefone", () => {
    expect(jidParaTelefone("556292429151@s.whatsapp.net")).toBe("+556292429151");
    expect(jidParaTelefone("49328018215052@lid")).toBeNull();
    expect(jidParaTelefone(null)).toBeNull();
  });
});
