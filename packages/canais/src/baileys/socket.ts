// Fronteira do SDK Baileys (invariante 1 do package: NADA fora de
// packages/canais importa SDK de canal). O worker orquestra sockets usando
// exclusivamente o que este módulo exporta.

import makeWASocket, {
  DisconnectReason,
  initAuthCreds,
  BufferJSON,
  makeCacheableSignalKeyStore,
  type AuthenticationState,
  type AuthenticationCreds,
  type SignalDataTypeMap,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import pino from "pino";

export type {
  AuthenticationState,
  AuthenticationCreds,
  WASocket,
  WAMessage,
};
export { initAuthCreds, BufferJSON, DisconnectReason };

// Armazenamento de credenciais plugável (o worker implementa sobre o
// Postgres cifrado — AuthStateBaileys). Chaves: "creds" e "<tipo>-<id>".
export interface ArmazenamentoAuth {
  ler(chave: string): Promise<string | null>;
  gravar(chave: string, valor: string): Promise<void>;
  remover(chave: string): Promise<void>;
}

/** Monta o AuthenticationState do Baileys sobre um armazenamento externo. */
export async function montarAuthState(
  armazenamento: ArmazenamentoAuth,
): Promise<{ state: AuthenticationState; salvarCreds: () => Promise<void> }> {
  const brutoCreds = await armazenamento.ler("creds");
  const creds: AuthenticationCreds = brutoCreds
    ? (JSON.parse(brutoCreds, BufferJSON.reviver) as AuthenticationCreds)
    : initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const resultado: { [id: string]: SignalDataTypeMap[T] } = {};
        await Promise.all(
          ids.map(async (id) => {
            const bruto = await armazenamento.ler(`${type}-${id}`);
            if (bruto) {
              resultado[id] = JSON.parse(bruto, BufferJSON.reviver) as SignalDataTypeMap[T];
            }
          }),
        );
        return resultado;
      },
      set: async (dados) => {
        const operacoes: Promise<void>[] = [];
        for (const [categoria, porId] of Object.entries(dados)) {
          for (const [id, valor] of Object.entries(porId ?? {})) {
            const chave = `${categoria}-${id}`;
            operacoes.push(
              valor == null
                ? armazenamento.remover(chave)
                : armazenamento.gravar(chave, JSON.stringify(valor, BufferJSON.replacer)),
            );
          }
        }
        await Promise.all(operacoes);
      },
    },
  };

  return {
    state,
    salvarCreds: () =>
      armazenamento.gravar("creds", JSON.stringify(state.creds, BufferJSON.replacer)),
  };
}

export interface EventosSocket {
  aoQr(qr: string): void;
  aoConectar(): void;
  // deveReconectar=false → sessão deslogada (limpar auth e re-parear)
  aoFechar(deveReconectar: boolean): void;
  aoMensagens(mensagens: WAMessage[]): void;
}

/** Cria o socket Baileys já ligado nos eventos. Logger silencioso (pino). */
export function criarSocketBaileys(
  state: AuthenticationState,
  salvarCreds: () => Promise<void>,
  eventos: EventosSocket,
): WASocket {
  const logger = pino({ level: "silent" });
  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    // Baileys imprime QR no terminal só p/ debug; o QR real vai ao painel
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", () => {
    void salvarCreds();
  });

  sock.ev.on("connection.update", (u) => {
    if (u.qr) eventos.aoQr(u.qr);
    if (u.connection === "open") eventos.aoConectar();
    if (u.connection === "close") {
      const codigo = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode;
      eventos.aoFechar(codigo !== DisconnectReason.loggedOut);
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type === "notify") eventos.aoMensagens(messages);
  });

  return sock;
}
