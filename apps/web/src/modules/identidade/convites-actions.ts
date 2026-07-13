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
  // valores devolvidos em erro p/ o form não resetar (React 19); senha NUNCA volta
  valores?: { nome?: string };
}

export async function aceitarConviteAction(
  _prev: EstadoAceite,
  formData: FormData,
): Promise<EstadoAceite> {
  const valores = { nome: String(formData.get("nome") ?? "") };
  const parsed = aceitarConviteSchema.safeParse({
    token: formData.get("token"),
    nome: formData.get("nome") || undefined,
    senha: formData.get("senha") || undefined,
  });
  if (!parsed.success) return { erro: "Dados inválidos — confira nome e senha (mín. 8).", valores };

  const r = await aceitarConvite(parsed.data.token, {
    nome: parsed.data.nome,
    senha: parsed.data.senha,
  });
  if (!r.ok) {
    const mensagens = {
      invalido: "Convite inválido, expirado ou já utilizado.",
      senha_incorreta: "Senha incorreta — use a senha da sua conta atende-ai existente.",
      dados_incompletos: "Preencha todos os campos (senha com mín. 8 caracteres).",
    } as const;
    return { erro: mensagens[r.motivo], valores };
  }

  const sessao = await montarSessao(r.usuarioId, r.empresaId);
  if (!sessao) return { erro: "Vínculo criado, mas falhou ao iniciar sessão — use o login.", valores };
  await criarCookieSessao(sessao);
  redirect("/agenda");
}
