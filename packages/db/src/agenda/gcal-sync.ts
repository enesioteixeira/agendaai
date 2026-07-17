// Google Calendar PULL (B5 — doc 02 §3.1 "GCal pull no MVP"). Cron (Workers
// Cron Trigger) chama executarSyncGcal(): para cada SincronizacaoGcal ativa,
// consulta o free/busy dos próximos 30 dias e SUBSTITUI os bloqueios
// origemGcal do profissional (replace-all idempotente, em transação).
//
// prismaSemTenant AQUI: listar as sincronizações ativas cruza tenants — é um
// job de plataforma e este arquivo é interno a packages/db (allowlist da regra
// inviolável 1). Todo o trabalho POR TENANT roda sob runWithTenant.
//
// Tokens: cifrados em repouso (AES-256-GCM, regra 15). O refresh_token do
// Google é trocado por access_token a cada execução (o access dura 1h e o
// cron roda a cada 10 min — não vale a pena persistir o access).

import { crypto as cryptoCore } from "@atende/core";

const { cifrarSegredo, decifrarSegredo } = cryptoCore;
import { prisma } from "../client.js";
import { runWithTenant } from "../tenancy.js";
import { prismaSemTenant } from "../unsafe.js";

const DIAS_JANELA = 30;

export interface TokensGcal {
  refreshToken: string;
}

export interface ConfigGoogleOAuth {
  clientId: string;
  clientSecret: string;
}

function configGoogle(): ConfigGoogleOAuth {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ausentes — configure os secrets.");
  }
  return { clientId, clientSecret };
}

/** Grava (upsert) a conexão de um profissional após o callback OAuth. */
export async function salvarConexaoGcal(input: {
  empresaId: string;
  profissionalId: string;
  refreshToken: string;
}): Promise<void> {
  const tokensCifrados = cifrarSegredo(JSON.stringify({ refreshToken: input.refreshToken }));
  await runWithTenant({ empresaId: input.empresaId }, async () => {
    await prisma.sincronizacaoGcal.upsert({
      where: { profissionalId: input.profissionalId },
      create: {
        profissionalId: input.profissionalId,
        tokensCifrados,
        estadoSync: "ativo",
      } as never,
      update: { tokensCifrados, estadoSync: "ativo" },
    });
  });
}

/** Desconecta (pausa) e remove os bloqueios espelhados do profissional. */
export async function desconectarGcal(empresaId: string, profissionalId: string): Promise<void> {
  await runWithTenant({ empresaId }, async () => {
    await prisma.$transaction([
      prisma.sincronizacaoGcal.update({
        where: { profissionalId },
        data: { estadoSync: "desconectado" },
      }),
      prisma.bloqueio.deleteMany({ where: { profissionalId, origemGcal: true } }),
    ]);
  });
}

async function trocarRefreshPorAccess(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = configGoogle();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) {
    const corpo = await r.text();
    // invalid_grant = usuário revogou o acesso → estado erro_token (chamador)
    throw new Error(`gcal-token-falhou:${r.status}:${corpo.slice(0, 200)}`);
  }
  const j = (await r.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("gcal-token-falhou:sem access_token");
  return j.access_token;
}

async function consultarFreeBusy(
  accessToken: string,
  inicio: Date,
  fim: Date,
): Promise<{ inicio: Date; fim: Date }[]> {
  const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      timeMin: inicio.toISOString(),
      timeMax: fim.toISOString(),
      items: [{ id: "primary" }],
    }),
  });
  if (!r.ok) throw new Error(`gcal-freebusy-falhou:${r.status}:${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as {
    calendars?: { primary?: { busy?: { start: string; end: string }[] } };
  };
  return (j.calendars?.primary?.busy ?? []).map((b) => ({
    inicio: new Date(b.start),
    fim: new Date(b.end),
  }));
}

/**
 * Aplica as janelas ocupadas como bloqueios origemGcal do profissional
 * (replace-all em transação). Separada da chamada ao Google para ser testável
 * E2E sem rede.
 */
export async function aplicarJanelasGcal(
  empresaId: string,
  profissionalId: string,
  janelas: { inicio: Date; fim: Date }[],
): Promise<void> {
  await runWithTenant({ empresaId }, async () => {
    await prisma.$transaction([
      prisma.bloqueio.deleteMany({ where: { profissionalId, origemGcal: true } }),
      ...(janelas.length
        ? [
            prisma.bloqueio.createMany({
              data: janelas.map((j) => ({
                profissionalId,
                tipo: "outro",
                inicio: j.inicio,
                fim: j.fim,
                motivo: "Google Calendar",
                origemGcal: true,
              })) as never,
            }),
          ]
        : []),
    ]);
    await prisma.sincronizacaoGcal.update({
      where: { profissionalId },
      data: { ultimaSyncEm: new Date() },
    });
  });
}

export interface ResultadoSyncGcal {
  processados: number;
  ok: number;
  erroToken: number;
  erroOutro: number;
}

/** Executa o pull de TODAS as sincronizações ativas (chamado pelo cron). */
export async function executarSyncGcal(): Promise<ResultadoSyncGcal> {
  // job de plataforma: única leitura cross-tenant, allowlist doc 02 §15.2
  const ativos = await prismaSemTenant.sincronizacaoGcal.findMany({
    where: { estadoSync: "ativo" },
    select: { empresaId: true, profissionalId: true, tokensCifrados: true },
  });

  const resultado: ResultadoSyncGcal = { processados: 0, ok: 0, erroToken: 0, erroOutro: 0 };
  const inicio = new Date();
  const fim = new Date(inicio.getTime() + DIAS_JANELA * 24 * 60 * 60 * 1000);

  for (const s of ativos) {
    resultado.processados++;
    try {
      const tokens = JSON.parse(decifrarSegredo(s.tokensCifrados)) as TokensGcal;
      const access = await trocarRefreshPorAccess(tokens.refreshToken);
      const janelas = await consultarFreeBusy(access, inicio, fim);
      await aplicarJanelasGcal(s.empresaId, s.profissionalId, janelas);
      resultado.ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("gcal-token-falhou")) {
        resultado.erroToken++;
        await runWithTenant({ empresaId: s.empresaId }, () =>
          prisma.sincronizacaoGcal.update({
            where: { profissionalId: s.profissionalId },
            data: { estadoSync: "erro_token" },
          }),
        ).catch(() => {});
      } else {
        resultado.erroOutro++;
      }
    }
  }
  return resultado;
}
