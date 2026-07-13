"use server";

// Server Actions de identidade. Toda action valida input com Zod de @atende/core
// (regra 14) e, quando cria sessão, monta o payload com escopos do papel.
// Cadastro e login são fluxos PRÉ-tenant (a empresa nasce no cadastro; no login
// o usuário ainda não escolheu empresa), por isso chamam serviços de @atende/db
// que rodam sob prismaSemTenant interno ao package.

import { redirect } from "next/navigation";
import {
  cadastroInicialSchema,
  loginSchema,
} from "@atende/core";
import { cadastroInicial, autenticar, montarSessao } from "@atende/db";
import { criarCookieSessao, apagarSessao } from "@/lib/sessao";

export interface EstadoForm {
  erro?: string;
  // valores devolvidos em erro p/ o form não resetar (React 19); senha NUNCA volta
  valores?: Record<string, string>;
}

export async function cadastrarAction(
  _prev: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const valores = {
    nome: String(formData.get("nome") ?? ""),
    email: String(formData.get("email") ?? ""),
    empresaNome: String(formData.get("empresaNome") ?? ""),
    empresaSlug: String(formData.get("empresaSlug") ?? ""),
    vertical: String(formData.get("vertical") ?? ""),
  };
  const parsed = cadastroInicialSchema.safeParse({
    ...valores,
    senha: formData.get("senha"),
    unidadeNome: formData.get("unidadeNome") || undefined,
  });
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos.", valores };
  }

  try {
    const r = await cadastroInicial(parsed.data);
    const sessao = await montarSessao(r.usuarioId, r.empresaId);
    if (!sessao) return { erro: "Falha ao iniciar sessão após o cadastro.", valores };
    await criarCookieSessao(sessao);
  } catch (e) {
    // erro comum: slug ou email já em uso (unique constraint)
    const msg = e instanceof Error ? e.message : "Erro ao criar conta.";
    if (msg.includes("Unique") || msg.includes("unique")) {
      return { erro: "Esse endereço (slug) ou e-mail já está em uso.", valores };
    }
    return { erro: msg, valores };
  }
  redirect("/agenda");
}

export async function loginAction(
  _prev: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const valores = { email: String(formData.get("email") ?? "") };
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!parsed.success) return { erro: "Informe e-mail e senha.", valores };

  const r = await autenticar(parsed.data);
  if (!r || r.vinculos.length === 0) {
    return { erro: "E-mail ou senha incorretos.", valores };
  }

  // MVP: usa o primeiro vínculo. Seletor de empresa (multi-tenant do mesmo
  // usuário) entra quando houver caso real de 2+ vínculos.
  const primeiro = r.vinculos[0];
  if (!primeiro) return { erro: "Nenhuma empresa ativa vinculada a este usuário.", valores };

  const sessao = await montarSessao(r.usuarioId, primeiro.empresaId);
  if (!sessao) return { erro: "Falha ao montar a sessão.", valores };
  await criarCookieSessao(sessao);
  redirect("/agenda");
}

export async function logoutAction(): Promise<void> {
  await apagarSessao();
  redirect("/login");
}
