// Fronteira do SDK Baileys (invariante 1 do package: NADA fora de
// packages/canais importa SDK de canal). O worker orquestra sockets usando
// exclusivamente o que este módulo exporta.

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  BufferJSON,
  makeCacheableSignalKeyStore,
  jidDecode,
  type AuthenticationState,
  type AuthenticationCreds,
  type SignalDataTypeMap,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import pino from "pino";

export { jidDecode };

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
  /** Recibos de entrega das mensagens que ENVIAMOS (✓ → ✓✓ → lida). */
  aoRecibos(recibos: readonly { idExterno: string; codigo: number | null }[]): void;
}

export type VersaoWhatsApp = [number, number, number];

/**
 * Versão do cliente WhatsApp Web que o socket anuncia ao conectar.
 *
 * ISTO NÃO É OPCIONAL, e a ausência dele já custou uma sessão inteira de
 * depuração. Sem `version`, o Baileys anuncia a constante embutida no pacote —
 * que envelhece a cada release do WhatsApp. Quando ela fica velha, o servidor
 * derruba a conexão com **405 Connection Failure ANTES de emitir o QR**. Como
 * 405 não é `loggedOut`, o gestor entende "queda passageira" e reconecta para
 * sempre: o log enche de "caiu — reconectando", o canal nunca sai de
 * `desconectado`, e não há erro nenhum apontando para a causa.
 *
 * Guardado em memória porque a resposta muda a cada dias, não a cada conexão, e
 * o worker reconcilia sockets a cada 15 segundos — buscar toda vez seria uma
 * chamada de rede por reconexão, no caminho crítico do pareamento.
 */
const VALIDADE_DA_VERSAO_MS = 6 * 60 * 60 * 1000;
let versaoEmCache: { versao: VersaoWhatsApp; buscadaEm: number } | null = null;

/**
 * A versão corrente, buscada do servidor do WhatsApp e mantida em cache.
 *
 * Nunca lança: se a busca falhar (máquina sem rede, servidor fora), devolve a
 * última conhecida — e, se nem essa existir, `undefined`, deixando o Baileys
 * usar a constante embutida. É degradação consciente: com rede caída não há
 * pareamento de qualquer jeito, e derrubar o worker inteiro por isso pararia
 * também os canais que já estão conectados.
 */
export async function obterVersaoWhatsApp(agora = Date.now()): Promise<VersaoWhatsApp | undefined> {
  if (versaoEmCache && agora - versaoEmCache.buscadaEm < VALIDADE_DA_VERSAO_MS) {
    return versaoEmCache.versao;
  }
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    if (!isLatest) {
      console.warn(
        "[baileys] não foi possível confirmar a versão do WhatsApp; usando a última conhecida. " +
          "Se o pareamento falhar com 405, é isto.",
      );
    }
    versaoEmCache = { versao: version as VersaoWhatsApp, buscadaEm: agora };
    return versaoEmCache.versao;
  } catch (e) {
    console.warn(`[baileys] falha ao buscar a versão do WhatsApp: ${(e as Error).message}`);
    return versaoEmCache?.versao;
  }
}

/** Esquece a versão em cache — existe para o teste não depender de relógio. */
export function esquecerVersaoWhatsApp(): void {
  versaoEmCache = null;
}

/** Cria o socket Baileys já ligado nos eventos. Logger silencioso (pino). */
export async function criarSocketBaileys(
  state: AuthenticationState,
  salvarCreds: () => Promise<void>,
  eventos: EventosSocket,
): Promise<WASocket> {
  const logger = pino({ level: "silent" });
  const version = await obterVersaoWhatsApp();
  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    ...(version ? { version } : {}),
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

  // `messages.update` carrega muita coisa além de recibo (edição, revogação,
  // reação). Só o que tem `status` interessa aqui; o resto é filtrado antes de
  // chegar ao gestor para ele não precisar conhecer o formato do Baileys.
  sock.ev.on("messages.update", (atualizacoes) => {
    const recibos = atualizacoes
      .filter((a) => a.key?.fromMe && a.key.id && a.update?.status != null)
      .map((a) => ({ idExterno: a.key.id as string, codigo: a.update.status as number }));
    if (recibos.length > 0) eventos.aoRecibos(recibos);
  });

  return sock;
}
