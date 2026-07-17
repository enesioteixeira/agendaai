import { describe, it, expect, beforeAll } from "vitest";
import { cifrarSegredo, decifrarSegredo, chaveConfigurada } from "./index.js";

describe("crypto AES-256-GCM (hard-fail)", () => {
  beforeAll(() => {
    // chave de teste determinística (32 bytes hex)
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  });

  it("roundtrip cifra e decifra", () => {
    const segredo = "token-oauth-secreto-123";
    const cifrado = decifrarSegredo(cifrarSegredo(segredo));
    expect(cifrado).toBe(segredo);
  });

  it("formato é enc:iv:tag:data", () => {
    const c = cifrarSegredo("x");
    expect(c.startsWith("enc:")).toBe(true);
    expect(c.split(":")).toHaveLength(4);
  });

  it("auth tag adulterada faz decifrar LANÇAR (não devolve ciphertext)", () => {
    const c = cifrarSegredo("secreto");
    const partes = c.split(":");
    // corromper o data
    partes[3] = Buffer.from("outra-coisa").toString("base64");
    expect(() => decifrarSegredo(partes.join(":"))).toThrow();
  });

  it("valor sem prefixo enc: LANÇA", () => {
    expect(() => decifrarSegredo("texto-puro")).toThrow(/formato cifrado/i);
  });

  it("chaveConfigurada reflete presença da chave", () => {
    expect(chaveConfigurada()).toBe(true);
  });
});

describe("crypto sem chave", () => {
  it("cifrarSegredo LANÇA sem ENCRYPTION_KEY", () => {
    const orig = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => cifrarSegredo("x")).toThrow(/ENCRYPTION_KEY ausente/);
    process.env.ENCRYPTION_KEY = orig;
  });
});
