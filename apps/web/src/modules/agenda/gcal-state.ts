// State assinado do OAuth Google (anti-CSRF do callback): HMAC-SHA256 com
// SESSION_SECRET sobre {profissionalId, usuarioId, exp}. O callback só aceita
// state íntegro, não expirado e cujo usuarioId bate com a SESSÃO atual — um
// atacante não consegue plantar o próprio Google Calendar no profissional de
// outra empresa (session riding).

import { createHmac, timingSafeEqual } from "node:crypto";

interface StateGcal {
  profissionalId: string;
  usuarioId: string;
  exp: number; // epoch ms
}

function segredo(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET ausente.");
  return s;
}

function assinar(payload: string): string {
  return createHmac("sha256", segredo()).update(payload).digest("base64url");
}

export function criarStateGcal(profissionalId: string, usuarioId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ profissionalId, usuarioId, exp: Date.now() + 10 * 60_000 } satisfies StateGcal),
  ).toString("base64url");
  return `${payload}.${assinar(payload)}`;
}

export function verificarStateGcal(state: string, usuarioIdSessao: string): StateGcal | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const esperado = assinar(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StateGcal;
    if (s.exp < Date.now()) return null;
    if (s.usuarioId !== usuarioIdSessao) return null;
    return s;
  } catch {
    return null;
  }
}
