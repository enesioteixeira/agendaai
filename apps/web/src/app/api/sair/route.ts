// Saída da sessão por Route Handler.
//
// Existe porque o Next só deixa escrever cookie em Server Action ou Route
// Handler. O layout do painel precisa derrubar a sessão quando o tenant dela
// não existe mais (banco restaurado, empresa removida) — e ele é um Server
// Component, então apagar o cookie ali estoura antes de qualquer redirect e o
// usuário vê "Algo deu errado" em vez de voltar ao login. O layout redireciona
// para cá; quem apaga é este arquivo.
//
// GET de propósito: o destino de um `redirect()` é uma navegação. Não há efeito
// destrutivo além de encerrar a própria sessão de quem chamou, e o cookie é
// `sameSite: lax` — um GET forjado de outro site derruba a sessão do próprio
// visitante, que é irritante e nada além disso.

import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "atende-sessao";

export function GET(req: NextRequest): NextResponse {
  const motivo = req.nextUrl.searchParams.get("motivo");
  const destino = new URL(motivo ? `/login?motivo=${motivo}` : "/login", req.nextUrl.origin);

  const resposta = NextResponse.redirect(destino);
  resposta.cookies.delete(COOKIE);
  return resposta;
}
