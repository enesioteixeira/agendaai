// A versão do cliente WhatsApp é o que separa "pareia" de "laço infinito".
//
// O que aconteceu: o socket subia sem `version`, o Baileys anunciava a
// constante embutida no pacote, e o servidor derrubava com **405 Connection
// Failure antes de emitir o QR**. Como 405 não é `loggedOut`, o gestor lia
// "queda passageira" e reconectava para sempre. O sintoma era um log infinito
// de "caiu — reconectando" e um canal eternamente `desconectado`; nenhum erro
// apontava para a causa.
//
// Estes testes cobrem o contrato da busca de versão. O que eles NÃO cobrem — se
// o WhatsApp aceita a conexão — é do mundo real e não cabe em teste
// automatizado: depende de rede e de um servidor de terceiro.

import { afterEach, describe, expect, it, vi } from "vitest";

const fetchLatestBaileysVersion = vi.fn();

vi.mock("@whiskeysockets/baileys", () => ({
  default: vi.fn(),
  fetchLatestBaileysVersion: () => fetchLatestBaileysVersion(),
  DisconnectReason: { loggedOut: 401 },
  initAuthCreds: vi.fn(),
  BufferJSON: { reviver: vi.fn(), replacer: vi.fn() },
  makeCacheableSignalKeyStore: vi.fn(),
  jidDecode: vi.fn(),
}));

const { obterVersaoWhatsApp, esquecerVersaoWhatsApp } = await import("./socket");

afterEach(() => {
  esquecerVersaoWhatsApp();
  fetchLatestBaileysVersion.mockReset();
  vi.restoreAllMocks();
});

describe("versão do cliente WhatsApp", () => {
  it("devolve a versão que o servidor informou", async () => {
    fetchLatestBaileysVersion.mockResolvedValue({ version: [2, 3000, 123], isLatest: true });

    await expect(obterVersaoWhatsApp()).resolves.toEqual([2, 3000, 123]);
  });

  // O worker reconcilia sockets a cada 15 segundos. Sem cache, cada reconexão
  // viraria uma chamada de rede no caminho crítico do pareamento.
  it("não busca de novo dentro da validade do cache", async () => {
    fetchLatestBaileysVersion.mockResolvedValue({ version: [2, 3000, 123], isLatest: true });

    await obterVersaoWhatsApp(0);
    await obterVersaoWhatsApp(60_000);
    await obterVersaoWhatsApp(3 * 60 * 60 * 1000);

    expect(fetchLatestBaileysVersion).toHaveBeenCalledTimes(1);
  });

  it("busca de novo depois da validade — a versão do WhatsApp muda sozinha", async () => {
    fetchLatestBaileysVersion.mockResolvedValue({ version: [2, 3000, 123], isLatest: true });
    await obterVersaoWhatsApp(0);

    fetchLatestBaileysVersion.mockResolvedValue({ version: [2, 3000, 999], isLatest: true });
    await expect(obterVersaoWhatsApp(7 * 60 * 60 * 1000)).resolves.toEqual([2, 3000, 999]);
    expect(fetchLatestBaileysVersion).toHaveBeenCalledTimes(2);
  });

  // Rede caída não pode derrubar o worker: os canais JÁ conectados continuam
  // atendendo, e é só o pareamento novo que fica sem poder acontecer.
  it("falha de rede não lança — degrada para a última versão conhecida", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchLatestBaileysVersion.mockResolvedValue({ version: [2, 3000, 123], isLatest: true });
    await obterVersaoWhatsApp(0);

    fetchLatestBaileysVersion.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    await expect(obterVersaoWhatsApp(7 * 60 * 60 * 1000)).resolves.toEqual([2, 3000, 123]);
  });

  it("sem versão conhecida e sem rede, devolve indefinido em vez de lançar", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchLatestBaileysVersion.mockRejectedValue(new Error("sem rede"));

    await expect(obterVersaoWhatsApp()).resolves.toBeUndefined();
  });

  // `isLatest: false` significa que o Baileys caiu na constante embutida — que é
  // exatamente a situação que produz o 405. O aviso existe para que a próxima
  // pessoa não gaste a sessão inteira procurando, como aconteceu.
  it("avisa quando não conseguiu confirmar a versão", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchLatestBaileysVersion.mockResolvedValue({ version: [2, 2413, 1], isLatest: false });

    await obterVersaoWhatsApp();

    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("405"));
  });
});
