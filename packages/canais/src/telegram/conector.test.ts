import { describe, expect, it } from "vitest";

import { capacidadesTelegram, criarConectorTelegram, normalizarInboundTelegram } from "./conector";

const EMP = "emp-1";
const CAN = "can-1";

function mensagem(extra: Record<string, unknown> = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 42,
      date: 1_755_360_000,
      text: "oi",
      chat: { id: 123456, type: "private" },
      from: { id: 123456, is_bot: false },
      ...extra,
    },
  };
}

describe("inbound", () => {
  it("normaliza mensagem de texto de conversa privada", () => {
    const n = normalizarInboundTelegram(EMP, CAN, mensagem());
    expect(n).toMatchObject({
      empresaId: EMP,
      canalId: CAN,
      identidadeExterna: { tipo: "telegram_id", valor: "123456" },
      tipo: "texto",
      texto: "oi",
      idExterno: "42",
    });
  });

  /**
   * Clique de botão vira mensagem de texto com o payload. É o que permite ao
   * motor tratar botão e digitação pelo mesmo caminho — a degradação para lista
   * numerada produz exatamente o mesmo texto do outro lado.
   */
  it("converte clique de botão em texto com o payload", () => {
    const n = normalizarInboundTelegram(EMP, CAN, {
      callback_query: {
        id: "cb-9",
        data: "confirmar_pedido",
        message: { message_id: 7, chat: { id: 123456 } },
        from: { id: 123456, is_bot: false },
      },
    });
    expect(n).toMatchObject({ tipo: "interativo", texto: "confirmar_pedido", idExterno: "cb:cb-9" });
  });

  it("descarta grupo, canal e mensagem de bot", () => {
    expect(normalizarInboundTelegram(EMP, CAN, mensagem({ chat: { id: 1, type: "group" } }))).toBeNull();
    expect(
      normalizarInboundTelegram(EMP, CAN, mensagem({ chat: { id: 1, type: "channel" } })),
    ).toBeNull();
    expect(
      normalizarInboundTelegram(EMP, CAN, mensagem({ from: { id: 9, is_bot: true } })),
    ).toBeNull();
  });

  it("admite mídia sem legenda, mas não texto vazio", () => {
    const foto = normalizarInboundTelegram(EMP, CAN, mensagem({ text: undefined, photo: [{}] }));
    expect(foto?.tipo).toBe("imagem");
    expect(normalizarInboundTelegram(EMP, CAN, mensagem({ text: undefined }))).toBeNull();
  });

  it("usa a legenda como texto quando há mídia com caption", () => {
    const n = normalizarInboundTelegram(EMP, CAN, mensagem({ text: undefined, caption: "olha isso", photo: [{}] }));
    expect(n?.texto).toBe("olha isso");
  });

  it("preserva o threading da resposta", () => {
    const n = normalizarInboundTelegram(EMP, CAN, mensagem({ reply_to_message: { message_id: 40 } }));
    expect(n?.respostaA).toBe("40");
  });

  it("recusa payload que não é update", () => {
    for (const lixo of [null, undefined, "texto", 42, {}]) {
      expect(normalizarInboundTelegram(EMP, CAN, lixo)).toBeNull();
    }
  });
});

describe("outbound", () => {
  function conector(capturado: { corpo?: unknown } = {}) {
    return criarConectorTelegram(
      {
        token: "t",
        fetch: async (_url, init) => {
          capturado.corpo = JSON.parse(String(init?.body ?? "{}"));
          return new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      },
      async () => "123456",
    );
  }

  it("envia texto e devolve o id externo para correlação de recibo", async () => {
    const capturado: { corpo?: unknown } = {};
    const r = await conector(capturado).enviar({
      empresaId: EMP,
      canalId: CAN,
      conversaId: "c1",
      texto: "olá",
    });
    expect(r.idExterno).toBe("99");
    expect(capturado.corpo).toMatchObject({ chat_id: "123456", text: "olá" });
  });

  /** O único canal do produto com botão nativo confiável — daí ele não degradar. */
  it("usa inline keyboard nativo, uma coluna por botão", async () => {
    const capturado: { corpo?: unknown } = {};
    await conector(capturado).enviar({
      empresaId: EMP,
      canalId: CAN,
      conversaId: "c1",
      texto: "Confirma?",
      botoes: [
        { payload: "sim", rotulo: "Sim" },
        { payload: "nao", rotulo: "Não" },
      ],
    });
    const corpo = capturado.corpo as { reply_markup?: { inline_keyboard?: unknown[][] } };
    expect(corpo.reply_markup?.inline_keyboard).toEqual([
      [{ text: "Sim", callback_data: "sim" }],
      [{ text: "Não", callback_data: "nao" }],
    ]);
  });

  /**
   * O Telegram só deixa o bot escrever para quem já falou com ele — o que
   * coincide com a regra 12. A restrição é estrutural, não configuração.
   */
  it("recusa envio proativo", async () => {
    expect(capacidadesTelegram.templates).toBe(false);
    await expect(
      conector().enviar({
        empresaId: EMP,
        canalId: CAN,
        conversaId: "c1",
        texto: "promoção!",
        templateProativo: { nome: "promo", variaveis: {} },
      }),
    ).rejects.toThrow(/proativo não existe/i);
  });

  it("levanta quando o Telegram recusa, em vez de fingir sucesso", async () => {
    const c = criarConectorTelegram(
      {
        token: "t",
        fetch: async () =>
          new Response(JSON.stringify({ ok: false, description: "chat not found" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }),
      },
      async () => "123",
    );
    await expect(
      c.enviar({ empresaId: EMP, canalId: CAN, conversaId: "c1", texto: "x" }),
    ).rejects.toThrow(/chat not found/);
  });
});
