import { describe, expect, it } from "vitest";

import { chaveDeMidia } from "./tipos";

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
