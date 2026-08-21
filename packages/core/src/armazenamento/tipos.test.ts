import { describe, expect, it } from "vitest";

import { autorizarLeituraDeMidia, chaveDeMidia, podeExibirNoNavegador } from "./tipos";

describe("chaveDeMidia", () => {
  // O prefixo de tenant não é organização de pastas: é a fronteira de
  // isolamento do bucket. Política de acesso por prefixo só funciona se o
  // prefixo for o tenant, e este teste é o que impede alguém "melhorar" a
  // chave colocando a data ou o canal na frente.
  it("começa pelo tenant", () => {
    expect(chaveDeMidia("emp_1", "conv_9", "msg_7")).toMatch(/^emp_1\//);
  });

  it("separa por conversa e termina na mensagem", () => {
    expect(chaveDeMidia("emp_1", "conv_9", "msg_7")).toBe("emp_1/conversas/conv_9/msg_7");
  });

  // Extensão em nome de arquivo vindo de fora é vetor conhecido de confusão de
  // tipo. Quem decide como exibir é o MIME guardado no banco.
  it("não carrega extensão", () => {
    expect(chaveDeMidia("emp_1", "conv_9", "msg_7")).not.toMatch(/\.[a-z0-9]+$/i);
  });

  it("dois tenants nunca colidem no mesmo caminho", () => {
    const a = chaveDeMidia("emp_a", "conv_igual", "msg_igual");
    const b = chaveDeMidia("emp_b", "conv_igual", "msg_igual");
    expect(a).not.toBe(b);
  });
});

describe("autorização de leitura", () => {
  it("libera a chave do próprio tenant", () => {
    const r = autorizarLeituraDeMidia(["emp_1", "conversas", "conv_9", "msg_7"], "emp_1");
    expect(r).toEqual({ ok: true, chave: "emp_1/conversas/conv_9/msg_7" });
  });

  it("recusa a chave de outro tenant", () => {
    const r = autorizarLeituraDeMidia(["emp_2", "conversas", "conv_9", "msg_7"], "emp_1");
    expect(r).toEqual({ ok: false, motivo: "outro-tenant" });
  });

  /**
   * O caso que um `startsWith` entregaria de graça: "emp_1/" é começo de
   * "emp_10/". Quem soubesse o formato do id leria a mídia do vizinho.
   */
  it("compara o tenant por segmento, não por começo de texto", () => {
    expect(autorizarLeituraDeMidia(["emp_10", "conversas", "c", "m"], "emp_1").ok).toBe(false);
    expect(autorizarLeituraDeMidia(["emp_1", "conversas", "c", "m"], "emp_10").ok).toBe(false);
  });

  it("recusa travessia e segmento vazio", () => {
    for (const caminho of [
      ["emp_1", "..", "emp_2", "x"],
      ["emp_1", "conversas", "", "m"],
      ["emp_1", ".", "m"],
      ["..", "emp_1", "m"],
    ]) {
      expect(autorizarLeituraDeMidia(caminho, "emp_1"), caminho.join("/")).toEqual({
        ok: false,
        motivo: "caminho-invalido",
      });
    }
  });

  it("recusa caminho curto demais para ser uma chave", () => {
    expect(autorizarLeituraDeMidia(["emp_1"], "emp_1").ok).toBe(false);
    expect(autorizarLeituraDeMidia([], "emp_1").ok).toBe(false);
  });
});

describe("o que o navegador pode renderizar", () => {
  it("exibe imagem, áudio e vídeo", () => {
    for (const t of ["image/jpeg", "image/png", "audio/ogg; codecs=opus", "video/mp4"]) {
      expect(podeExibirNoNavegador(t), t).toBe(true);
    }
  });

  /**
   * SVG é documento com script, não figura. Renderizado na nossa origem, onde
   * mora o cookie do painel, um anexo vira XSS armazenado.
   */
  it("nunca exibe SVG", () => {
    expect(podeExibirNoNavegador("image/svg+xml")).toBe(false);
    expect(podeExibirNoNavegador("IMAGE/SVG+XML")).toBe(false);
  });

  it("manda baixar documento, HTML e o que não souber", () => {
    for (const t of ["application/pdf", "text/html", "application/octet-stream", ""]) {
      expect(podeExibirNoNavegador(t), t).toBe(false);
    }
  });
});
