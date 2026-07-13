// Convites de usuário (doc 02 §2). O token viaja no link; o banco guarda só
// o SHA-256 (vazamento de banco não vira acesso). Criar/listar rodam SOB o
// tenant (prisma com extension); aceitar é PRÉ-tenant (o convidado não tem
// sessão) — prismaSemTenant interno a packages/db (allowlist doc 09 §3.2),
// com empresaId vindo da linha do convite, nunca de input.

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../client";
import { prismaSemTenant } from "../unsafe";
import { contextoTenantAtual } from "../tenancy";
import { hashSenha } from "@atende/core";

const VALIDADE_DIAS = 7;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ConviteCriado {
  conviteId: string;
  token: string; // devolvido UMA vez — vai no link; só o hash persiste
  expiraEm: Date;
}

// Cria (ou reemite) um convite. Reenvio revoga o pendente anterior — o unique
// parcial (empresaId, email WHERE pendente) garante no banco que nunca há dois.
export async function criarConvite(input: {
  email: string;
  papelId: string;
  unidadesPermitidas: string[];
}): Promise<ConviteCriado> {
  const token = randomBytes(32).toString("hex");
  const expiraEm = new Date(Date.now() + VALIDADE_DIAS * 24 * 60 * 60 * 1000);
  // O tipo do create exige empresaId (a injeção da extension é runtime);
  // pegamos do contexto — a extension confere que bate (fonte única).
  const { empresaId } = contextoTenantAtual();

  await prisma.conviteUsuario.updateMany({
    where: { email: input.email, status: "pendente" },
    data: { status: "revogado" },
  });

  const convite = await prisma.conviteUsuario.create({
    data: {
      empresaId,
      email: input.email,
      papelId: input.papelId,
      unidadesPermitidas: input.unidadesPermitidas,
      tokenHash: hashToken(token),
      status: "pendente",
      expiraEm,
    },
  });

  return { conviteId: convite.id, token, expiraEm };
}

export interface ConvitePublico {
  empresaId: string;
  empresaNome: string;
  email: string;
  papelNome: string;
  emailJaCadastrado: boolean;
}

// Resolve um token para exibir a tela de aceite (pré-tenant, só leitura).
export async function consultarConvite(token: string): Promise<ConvitePublico | null> {
  const convite = await prismaSemTenant.conviteUsuario.findFirst({
    where: { tokenHash: hashToken(token), status: "pendente", expiraEm: { gt: new Date() } },
    include: { empresa: { select: { nome: true, ativa: true } }, papel: { select: { nome: true } } },
  });
  if (!convite || !convite.empresa.ativa) return null;

  const usuario = await prismaSemTenant.usuario.findUnique({
    where: { email: convite.email },
    select: { id: true, deletedAt: true },
  });

  return {
    empresaId: convite.empresaId,
    empresaNome: convite.empresa.nome,
    email: convite.email,
    papelNome: convite.papel.nome,
    emailJaCadastrado: Boolean(usuario && !usuario.deletedAt),
  };
}

export interface ResultadoAceite {
  usuarioId: string;
  empresaId: string;
}

// Aceita o convite. Se o e-mail ainda não tem conta, exige nome+senha e cria
// o Usuario; se já tem, apenas cria o vínculo (o link é a credencial do aceite
// — token de 32 bytes, expira em 7 dias). Transacional: vínculo e status do
// convite mudam juntos ou nada muda.
export async function aceitarConvite(
  token: string,
  dados: { nome?: string; senha?: string },
): Promise<ResultadoAceite | null> {
  const convite = await prismaSemTenant.conviteUsuario.findFirst({
    where: { tokenHash: hashToken(token), status: "pendente", expiraEm: { gt: new Date() } },
  });
  if (!convite) return null;

  const existente = await prismaSemTenant.usuario.findUnique({
    where: { email: convite.email },
  });
  if (existente?.deletedAt) return null; // titular excluído não é re-vinculável por convite

  let senhaHash: string | null = null;
  if (!existente) {
    if (!dados.nome || !dados.senha) return null; // conta nova exige nome+senha
    senhaHash = await hashSenha(dados.senha);
  }

  return prismaSemTenant.$transaction(async (tx) => {
    const usuario =
      existente ??
      (await tx.usuario.create({
        data: { email: convite.email, senhaHash: senhaHash!, nome: dados.nome! },
      }));

    // idempotência: se o vínculo já existe (aceite duplo), só reativa
    const vinculo = await tx.vinculoUsuarioEmpresa.findFirst({
      where: { empresaId: convite.empresaId, usuarioId: usuario.id },
    });
    if (vinculo) {
      await tx.vinculoUsuarioEmpresa.update({
        where: { id: vinculo.id },
        data: { ativo: true, papelId: convite.papelId },
      });
    } else {
      await tx.vinculoUsuarioEmpresa.create({
        data: {
          empresaId: convite.empresaId,
          usuarioId: usuario.id,
          papelId: convite.papelId,
          unidadesPermitidas: convite.unidadesPermitidas ?? [],
        },
      });
    }

    await tx.conviteUsuario.update({
      where: { id: convite.id },
      data: { status: "aceito" },
    });

    return { usuarioId: usuario.id, empresaId: convite.empresaId };
  });
}

export interface MembroEquipe {
  vinculoId: string;
  nome: string;
  email: string;
  papelNome: string;
  ativo: boolean;
}

// Lista membros + convites pendentes do tenant (para a tela de configurações).
// Roda SOB o tenant.
export async function listarEquipe(): Promise<{
  membros: MembroEquipe[];
  convitesPendentes: { id: string; email: string; papelNome: string; expiraEm: Date }[];
  papeis: { id: string; nome: string }[];
}> {
  const [vinculos, convites, papeis] = await Promise.all([
    prisma.vinculoUsuarioEmpresa.findMany({
      include: { usuario: { select: { nome: true, email: true } }, papel: { select: { nome: true } } },
    }),
    prisma.conviteUsuario.findMany({
      where: { status: "pendente", expiraEm: { gt: new Date() } },
      include: { papel: { select: { nome: true } } },
    }),
    prisma.papel.findMany({ orderBy: { nome: "asc" } }),
  ]);

  return {
    membros: vinculos.map((v) => ({
      vinculoId: v.id,
      nome: v.usuario.nome,
      email: v.usuario.email,
      papelNome: v.papel.nome,
      ativo: v.ativo,
    })),
    convitesPendentes: convites.map((c) => ({
      id: c.id,
      email: c.email,
      papelNome: c.papel.nome,
      expiraEm: c.expiraEm,
    })),
    papeis: papeis.map((p) => ({ id: p.id, nome: p.nome })),
  };
}
