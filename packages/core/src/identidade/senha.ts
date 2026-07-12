// Hash de senha com argon2id (doc 02 §2: Usuario.senhaHash argon2id).
// Usa hash-wasm (WebAssembly) em vez de bindings nativos porque o apps/web
// roda em Cloudflare Workers, onde binários nativos não carregam — WASM roda
// igual em Workers e Node. Decisão registrada no AGENTS.md de core.

import { argon2id, argon2Verify } from "hash-wasm";
import { randomBytes } from "node:crypto";

// Parâmetros OWASP para argon2id (2024): m=19MiB, t=2, p=1.
const PARAMS = { parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32 } as const;

export async function hashSenha(senha: string): Promise<string> {
  if (senha.length < 8) {
    throw new Error("Senha deve ter ao menos 8 caracteres.");
  }
  const salt = randomBytes(16);
  // hash-wasm devolve string no formato PHC ($argon2id$v=19$m=...$salt$hash),
  // que já embute salt e parâmetros — verificação não precisa deles à parte.
  return argon2id({
    password: senha,
    salt,
    ...PARAMS,
    outputType: "encoded",
  });
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: senha, hash });
  } catch {
    return false;
  }
}
