// AES-256-GCM para segredos em repouso (tokens OAuth, senha SMTP, config de
// canal cifrada). Port do ev-tracker (src/lib/crypto.ts) com a adaptação do
// doc 08: SÓ a variante HARD-FAIL sobrevive — o passthrough silencioso do
// ev-tracker é BANIDO aqui (regra inviolável 15). Formato: enc:iv:tag:data.

import crypto from "node:crypto";

function obterChave(): Buffer {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) {
    throw new Error(
      "ENCRYPTION_KEY ausente — impossível cifrar/decifrar segredo (regra 15). " +
        "Esperado 32 bytes em hex de 64 chars ou base64.",
    );
  }
  const buf = /^[0-9a-fA-F]{64}$/.test(k) ? Buffer.from(k, "hex") : Buffer.from(k, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY com tamanho inválido (esperado 32 bytes).");
  }
  return buf;
}

/** true quando há chave válida — permite recusar a operação com erro amigável antes de tentar. */
export function chaveConfigurada(): boolean {
  try {
    obterChave();
    return true;
  } catch {
    return false;
  }
}

/** Cifra um segredo. Sempre retorna "enc:..." ou LANÇA — nunca passthrough. */
export function cifrarSegredo(texto: string): string {
  const key = obterChave();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return `enc:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/**
 * Decifra um valor cifrado por cifrarSegredo. Exige o prefixo "enc:" e LANÇA
 * em chave ausente, formato inválido ou auth tag adulterada — nunca devolve o
 * ciphertext bruto.
 */
export function decifrarSegredo(valor: string): string {
  if (!valor || !valor.startsWith("enc:")) {
    throw new Error("Valor não está no formato cifrado esperado (enc:...).");
  }
  const partes = valor.split(":");
  if (partes.length !== 4) {
    throw new Error("Formato cifrado inválido (esperado enc:iv:tag:data).");
  }
  const [, ivb, tagb, datab] = partes as [string, string, string, string];
  const key = obterChave();
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivb, "base64"));
  d.setAuthTag(Buffer.from(tagb, "base64"));
  return Buffer.concat([d.update(Buffer.from(datab, "base64")), d.final()]).toString("utf8");
}
