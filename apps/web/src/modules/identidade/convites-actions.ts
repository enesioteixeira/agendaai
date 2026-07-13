"use server";

// Actions de convite. Convidar exige o escopo config:usuarios (guard no array
// da sessão — doc 02 §13) e roda SOB o tenant da sessão (regra 3: tenant nunca
// vem de input). Aceitar é pré-tenant: a credencial é o próprio token do link.

import { redirect } from "next/navigation";
import { convidarUsuarioSchema, aceitarConviteSchema, exigirEscopo } from "@atende/core";
import { runWithTenant, criarConvite, aceitarConvite, montarSessao } from "@atende/db";
import { lerSessao, criarCookieSessao } from "@/lib/sessao";

export interface EstadoConvite {
  erro?: string;
  linkConvite?: string;
  emailConvidado?: string;
}

export async function convidarAction(
  _prev: EstadoConvite,
  formData: FormData,
): Promise<EstadoConvite> {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");
  try {
    exigirEscopo(sessao, "config:usuarios");
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Sem permissão." };
  }

  const parsed = convidarUsuarioSchema.safeParse({
    email: formData.get("email"),
    papelId: formData.get("papelId"),
    unidadesPermitidas: [],
  });
  if (!parsed.success) return { erro: "Informe e-mail e papel válidos." };

  try {
    const convite = await runWithTenant({ empresaId: sessao.empresaId, usuarioId: sessao.usuarioId }, () =>
      criarConvite(parsed.data),
    );
    // Sem módulo de e-mail ainda (Bloco 4/D): o link é exibido para copiar e
    // enviar manualmente. Quando a cascata Brevo entrar, o envio vira automático.
    const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
    return {
      linkConvite: `${base}/convite/${convite.token}`,
      emailConvidado: parsed.data.email,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar convite.";
    return { erro: msg.includes("nique") ? "Já existe convite pendente para esse e-mail." : msg };
  }
}

export interface EstadoAceite {
  erro?: string;
}

export async function aceitarConviteAction(
  _prev: EstadoAceite,
  formData: FormData,
): Promise<EstadoAceite> {
  const parsed = aceitarConviteSchema.safeParse({
    token: formData.get("token"),
    nome: formData.get("nome") || undefined,
    senha: formData.get("senha") || undefined,
  });
  if (!parsed.success) return { erro: "Dados inválidos — confira nome e senha (mín. 8)." };

  const r = await aceitarConvite(parsed.data.token, {
    nome: parsed.data.nome,
    senha: parsed.data.senha,
  });
  if (!r) return { erro: "Convite inválido, expirado ou já utilizado." };

  const sessao = await montarSessao(r.usuarioId, r.empresaId);
  if (!sessao) return { erro: "Vínculo criado, mas falhou ao iniciar sessão — use o login." };
  await criarCookieSessao(sessao);
  redirect("/agenda");
}
