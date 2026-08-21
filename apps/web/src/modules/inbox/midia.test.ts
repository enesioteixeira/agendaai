import { describe, expect, it } from "vitest";

import { formaDoAnexo, formatarTamanho, lerAnexos, rotuloDoAnexo } from "./midia";

describe("leitura defensiva dos anexos", () => {
  it("lê o formato que o worker grava", () => {
    const anexos = lerAnexos([
      {
        url: "/api/midia/emp_1/conversas/c/m",
        mimeType: "image/jpeg",
        tamanhoBytes: 2048,
      },
    ]);
    expect(anexos).toHaveLength(1);
    expect(anexos[0]?.url).toBe("/api/midia/emp_1/conversas/c/m");
    expect(anexos[0]?.nomeArquivo).toBeUndefined();
  });

  /**
   * Coluna JSON não tem tipo garantido. Uma linha gravada por outra versão do
   * worker não pode derrubar a timeline — a conversa vale mais que o anexo.
   */
  it("devolve lista vazia para qualquer coisa que não seja lista", () => {
    for (const lixo of [null, undefined, {}, "", 7, "texto"]) {
      expect(lerAnexos(lixo), String(lixo)).toEqual([]);
    }
  });

  it("descarta item sem url ou sem mimeType, e mantém os bons", () => {
    const anexos = lerAnexos([
      { mimeType: "image/png" },
      { url: "/a" },
      { url: "", mimeType: "image/png" },
      null,
      "texto",
      { url: "/b", mimeType: "application/pdf", nomeArquivo: "contrato.pdf" },
    ]);
    expect(anexos).toHaveLength(1);
    expect(anexos[0]?.nomeArquivo).toBe("contrato.pdf");
  });

  it("cai em zero quando o tamanho não é número utilizável", () => {
    expect(lerAnexos([{ url: "/a", mimeType: "image/png", tamanhoBytes: -5 }])[0]?.tamanhoBytes).toBe(0);
    expect(lerAnexos([{ url: "/a", mimeType: "image/png", tamanhoBytes: "500" }])[0]?.tamanhoBytes).toBe(0);
  });
});

describe("forma do anexo", () => {
  it("decide pelo MIME", () => {
    expect(formaDoAnexo("image/jpeg")).toBe("imagem");
    expect(formaDoAnexo("audio/ogg; codecs=opus")).toBe("audio");
    expect(formaDoAnexo("video/mp4")).toBe("video");
    expect(formaDoAnexo("application/pdf")).toBe("arquivo");
    expect(formaDoAnexo("")).toBe("arquivo");
  });

  /** Mesma razão pela qual a rota o serve como anexo: SVG executa script. */
  it("nunca renderiza SVG como imagem", () => {
    expect(formaDoAnexo("image/svg+xml")).toBe("arquivo");
  });
});

describe("rótulo", () => {
  it("formata tamanho em escala legível", () => {
    expect(formatarTamanho(0)).toBe("");
    expect(formatarTamanho(512)).toBe("512 B");
    expect(formatarTamanho(2048)).toBe("2 kB");
    expect(formatarTamanho(3 * 1024 * 1024)).toBe("3,0 MB");
  });

  it("usa 'Arquivo' quando o documento veio sem nome", () => {
    expect(rotuloDoAnexo({ url: "/a", mimeType: "application/pdf", tamanhoBytes: 1024 })).toBe(
      "Arquivo · 1 kB",
    );
    expect(
      rotuloDoAnexo({ url: "/a", mimeType: "application/pdf", tamanhoBytes: 0, nomeArquivo: "x.pdf" }),
    ).toBe("x.pdf");
  });
});
