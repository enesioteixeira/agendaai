// Convites de usuário (doc 02 §2). O token viaja no link; o banco guarda só
// o SHA-256 (vazamento de banco não vira acesso). Criar/listar rodam SOB o
// tenant (prisma com extension); aceitar é PRÉ-tenant (o convidado não tem
// sessão) — prismaSemTenant interno a packages/db (allowlist doc 09 §3.2),
// com empresaId vindo da linha do convite, nunca de input.
//
// DECISÃO DE SEGURANÇA (revisão adversarial do Bloco 1): o link do convite é
// exibido ao CONVIDADOR (não há módulo de e-mail ainda), logo o token NÃO pode
// valer como credencial de um usuário que JÁ EXISTE — o dono da conta confirma
// a própria senha no aceite. Para conta nova, o token + criação de senha é o
// fluxo normal; a posse do e-mail só será comprovável quando o envio automático
// por e-mail entrar (Fase D) — limitação registrada no AGENTS.md.

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../client.js";
import { prismaSemTenant } from "../unsafe.js";
import { contextoTenantAtual } from "../tenancy.js";
import { hashSenha, verificarSenha } from "@atende/core";

const VALIDADE_DIAS = 7;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ConviteCriado {
  conviteId: string;
  token: string; // devolvido UMA vez — vai no link; só o hash persiste
  expiraEm: Date;
}

// Cria (ou reemite) um convite. Reenvio revoga o pendente anterior na MESMA
// transação do create — falha no meio não deixa o e-mail sem convite válido.
// O unique parcial (empresaId, email WHERE pendente) garante no banco que
// nunca há dois pendentes.
export async function criarConvite(input: {
  email: string;
  papelId: string;
  unidadesPermitidas: string[];
}): Promise<ConviteCriado> {
  // O tipo do create exige empresaId (a injeção da extension é runtime);
  // pegamos do contexto — a extension confere que bate (fonte única).
  const { empresaId } = contextoTenantAtual();

  // papelId vem de input do cliente — validar que o papel É deste tenant
  // (a extension injeta empresaId no where). Sem isso, um papelId de outro
  // tenant criaria vínculo com zero escopos e vazaria o nome do papel alheio
  // na tela de aceite.
  const papel = await prisma.papel.findFirst({ where: { id: input.papelId } });
  if (!papel) {
    throw new Error("Papel inválido para esta empresa.");
  }

  // Convite não é canal de troca de papel: e-mail que já é membro ATIVO deste
  // tenant é recusado (senão um convite aceito sobrescreveria o papel — incl.
  // rebaixar o último administrador). Reativação de membro inativo é permitida.
  const usuarioExistente = await prismaSemTenant.usuario.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (usuarioExistente) {
    const vinculoAtivo = await prisma.vinculoUsuarioEmpresa.findFirst({
      where: { usuarioId: usuarioExistente.id, ativo: true },
    });
    if (vinculoAtivo) {
      throw new Error("Essa pessoa já é membro ativo da empresa — altere o papel dela em vez de convidar.");
    }
  }

  const token = randomBytes(32).toString("hex");
  const expiraEm = new Date(Date.now() + VALIDADE_DIAS * 24 * 60 * 60 * 1000);

  const convite = await prisma.$transaction(async (tx) => {
    await tx.conviteUsuario.updateMany({
      where: { email: input.email, status: "pendente" },
      data: { status: "revogado" },
    });
    return tx.conviteUsuario.create({
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

export type AceiteResultado =
  | { ok: true; usuarioId: string; empresaId: string }
  | { ok: false; motivo: "invalido" | "senha_incorreta" | "dados_incompletos" };

class AceiteInvalidoErro extends Error {}

// Aceita o convite. Conta NOVA: exige nome+senha (cria o Usuario). Conta
// EXISTENTE: exige a senha ATUAL do dono (o link não é credencial — ver
// decisão no topo). Transacional com CLAIM ATÔMICO: o updateMany condicional
// no status garante que dois aceites simultâneos não passam — o segundo
// recebe "invalido" limpo, sem exceção vazando.
export async function aceitarConvite(
  token: string,
  dados: { nome?: string; senha?: string },
): Promise<AceiteResultado> {
  const convite = await prismaSemTenant.conviteUsuario.findFirst({
    where: { tokenHash: hashToken(token), status: "pendente", expiraEm: { gt: new Date() } },
    include: { empresa: { select: { ativa: true } } },
  });
  // empresa.ativa também é rechecada em montarSessao (chokepoint) — aqui
  // evita mutar vínculo em tenant suspenso.
  if (!convite || !convite.empresa.ativa) return { ok: false, motivo: "invalido" };

  const existente = await prismaSemTenant.usuario.findUnique({
    where: { email: convite.email },
  });
  if (existente?.deletedAt) return { ok: false, motivo: "invalido" }; // titular excluído não re-vincula por convite

  let senhaHashNova: string | null = null;
  if (existente) {
    if (!dados.senha) return { ok: false, motivo: "dados_incompletos" };
    const senhaOk = await verificarSenha(dados.senha, existente.senhaHash);
    if (!senhaOk) return { ok: false, motivo: "senha_incorreta" };
  } else {
    if (!dados.nome || !dados.senha) return { ok: false, motivo: "dados_incompletos" };
    senhaHashNova = await hashSenha(dados.senha);
  }

  try {
    return await prismaSemTenant.$transaction(async (tx) => {
      // claim atômico: só o primeiro aceite muda pendente -> aceito
      const claim = await tx.conviteUsuario.updateMany({
        where: { id: convite.id, status: "pendente" },
        data: { status: "aceito" },
      });
      if (claim.count === 0) throw new AceiteInvalidoErro();

      const usuario =
        existente ??
        (await tx.usuario.create({
          data: { email: convite.email, senhaHash: senhaHashNova!, nome: dados.nome! },
        }));

      // reativação: convite para membro inativo reativa o vínculo com o papel
      // do convite (membro ATIVO nunca chega aqui — criarConvite recusa)
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

      return { ok: true as const, usuarioId: usuario.id, empresaId: convite.empresaId };
    });
  } catch (e) {
    // corrida de aceite duplo, unique violado por registro concorrente etc.
    // — resultado limpo para o usuário; log para diagnóstico.
    if (!(e instanceof AceiteInvalidoErro)) {
      console.error("[convites] aceite falhou:", e);
    }
    return { ok: false, motivo: "invalido" };
  }
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
