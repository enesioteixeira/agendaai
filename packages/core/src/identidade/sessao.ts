// Assinatura e verificação de sessão JWT — parte PURA (sem next/headers),
// para poder rodar no worker (verificação p/ SSE) e no web. O manuseio de
// cookie fica em apps/web/src/lib/sessao.ts. Port do ev-tracker (session.ts)
// com payload novo de tenancy (doc 08 §3.7 + doc 01 §5.3).

import { SignJWT, jwtVerify } from "jose";
import { sessaoPayloadSchema } from "./schemas";
import type { SessaoPayload } from "./types";

// Chave avaliada em runtime (não no import) para não quebrar build.
// FAIL-CLOSED: o fallback de desenvolvimento só existe quando o ambiente se
// declara explicitamente development/test — NODE_ENV ausente ou qualquer outro
// valor lança. (Endurecido vs. ev-tracker, que só checava === "production":
// deploy com NODE_ENV esquecido ganharia sessões forjáveis.)
export function obterSessionSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (s) return new TextEncoder().encode(s);
  const env = process.env.NODE_ENV;
  if (env === "development" || env === "test" || process.env.VITEST) {
    return new TextEncoder().encode("fallback-dev-secret-trocar-em-prod");
  }
  throw new Error("SESSION_SECRET não configurado — obrigatório fora de development/test.");
}

const DURACAO = "7d";

export async function assinarSessao(payload: SessaoPayload): Promise<string> {
  // valida o payload antes de assinar — nunca emitir token com shape errado
  const valido = sessaoPayloadSchema.parse(payload);
  return new SignJWT({ ...valido })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(DURACAO)
    .sign(obterSessionSecret());
}

export async function verificarSessao(token: string): Promise<SessaoPayload | null> {
  try {
    const { payload } = await jwtVerify(token, obterSessionSecret());
    const parsed = sessaoPayloadSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Guard de escopo: o array de escopos viaja no JWT (doc 02 §13, nota 1) —
// o guard checa o array da sessão, sem query por request.
export function temEscopo(sessao: SessaoPayload, escopo: string): boolean {
  return sessao.escopos.includes(escopo);
}

export function exigirEscopo(sessao: SessaoPayload, escopo: string): void {
  if (!temEscopo(sessao, escopo)) {
    throw new Error(`Ação negada: falta o escopo "${escopo}" (papel atual não permite).`);
  }
}
