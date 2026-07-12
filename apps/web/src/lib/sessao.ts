// Manuseio de cookie de sessão — a parte acoplada a next/headers (doc 08 §3.7:
// separada da assinatura/verificação pura, que vive em @atende/core). Só isto
// fica no web; a lógica de JWT é portável e testável no core.

import { cookies } from "next/headers";
import { assinarSessao, verificarSessao, type SessaoPayload } from "@atende/core";

const COOKIE = "atende-sessao";

export async function criarCookieSessao(payload: SessaoPayload): Promise<void> {
  const token = await assinarSessao(payload);
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
}

export async function lerSessao(): Promise<SessaoPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  return verificarSessao(token);
}

export async function apagarSessao(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
