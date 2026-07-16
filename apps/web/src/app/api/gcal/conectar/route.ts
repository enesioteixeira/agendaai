// Inicia o OAuth do Google Calendar para um profissional (B5). Guard:
// sessão + agenda:configurar + profissional pertence ao tenant da sessão.
// Escopo Google MÍNIMO (LGPD minimização): calendar.freebusy — só janelas
// ocupado/livre, nunca título/participantes dos eventos.

import { NextRequest, NextResponse } from "next/server";
import { temEscopo } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { lerSessao } from "@/lib/sessao";
import { criarStateGcal } from "@/modules/agenda/gcal-state";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sessao = await lerSessao();
  if (!sessao) return NextResponse.redirect(new URL("/login", req.url));
  if (!temEscopo(sessao, "agenda:configurar")) {
    return NextResponse.json({ erro: "Sem escopo agenda:configurar." }, { status: 403 });
  }

  const profissionalId = req.nextUrl.searchParams.get("profissionalId") ?? "";
  const profissional = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    () => prisma.profissional.findUnique({ where: { id: profissionalId } }),
  );
  if (!profissional || profissional.deletedAt) {
    return NextResponse.json({ erro: "Profissional não encontrado." }, { status: 404 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const base = process.env.APP_BASE_URL;
  if (!clientId || !base) {
    return NextResponse.json(
      { erro: "Integração Google não configurada (GOOGLE_CLIENT_ID/APP_BASE_URL)." },
      { status: 503 },
    );
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${base}/api/gcal/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.freebusy");
  url.searchParams.set("access_type", "offline"); // refresh_token
  url.searchParams.set("prompt", "consent"); // garante refresh_token a cada conexão
  url.searchParams.set("state", criarStateGcal(profissionalId, sessao.usuarioId));
  return NextResponse.redirect(url);
}
