// Callback do OAuth Google (B5): valida state assinado contra a SESSÃO atual,
// troca o code por tokens e grava o refresh_token cifrado no
// SincronizacaoGcal do profissional. Depois dispara um sync imediato para o
// horário ocupado aparecer na hora (o cron mantém a partir daí).

import { NextRequest, NextResponse } from "next/server";
import { temEscopo } from "@atende/core";
import { salvarConexaoGcal, executarSyncGcal } from "@atende/db";
import { lerSessao } from "@/lib/sessao";
import { verificarStateGcal } from "@/modules/agenda/gcal-state";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sessao = await lerSessao();
  if (!sessao) return NextResponse.redirect(new URL("/login", req.url));
  if (!temEscopo(sessao, "agenda:configurar")) {
    return NextResponse.json({ erro: "Sem escopo agenda:configurar." }, { status: 403 });
  }

  const painel = new URL("/agenda/profissionais", req.url);
  const code = req.nextUrl.searchParams.get("code");
  const state = verificarStateGcal(req.nextUrl.searchParams.get("state") ?? "", sessao.usuarioId);
  if (!code || !state) {
    painel.searchParams.set("gcal", "erro-state");
    return NextResponse.redirect(painel);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const base = process.env.APP_BASE_URL;
  if (!clientId || !clientSecret || !base) {
    painel.searchParams.set("gcal", "erro-config");
    return NextResponse.redirect(painel);
  }

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${base}/api/gcal/callback`,
    }),
  });
  if (!r.ok) {
    painel.searchParams.set("gcal", "erro-troca");
    return NextResponse.redirect(painel);
  }
  const tokens = (await r.json()) as { refresh_token?: string };
  if (!tokens.refresh_token) {
    // acontece se o consent foi pulado — prompt=consent evita, mas trate
    painel.searchParams.set("gcal", "erro-sem-refresh");
    return NextResponse.redirect(painel);
  }

  await salvarConexaoGcal({
    empresaId: sessao.empresaId,
    profissionalId: state.profissionalId,
    refreshToken: tokens.refresh_token,
  });
  // sync imediato (poucas conexões por tenant; ~2 fetches por profissional)
  await executarSyncGcal().catch(() => {});

  painel.searchParams.set("gcal", "ok");
  return NextResponse.redirect(painel);
}
