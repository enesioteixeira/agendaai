// Rota interna do Cron Trigger (worker.ts → scheduled). Autenticação por
// CRON_SECRET (Bearer) — sem sessão: é job de plataforma. A lógica vive em
// @atende/db (executarSyncGcal); aqui só o guard e o relatório.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { executarSyncGcal } from "@atende/db";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const segredo = process.env.CRON_SECRET;
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(recebido);
  const b = Buffer.from(segredo ?? "");
  if (!segredo || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const resultado = await executarSyncGcal();
  return NextResponse.json(resultado);
}
