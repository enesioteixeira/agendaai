// Autenticação: valida email+senha, resolve o vínculo de tenant do usuário e
// monta o payload de sessão (com os escopos materializados do PapelEscopo).
// Login também é pré-tenant (o usuário ainda não "escolheu" empresa), então
// usa prismaSemTenant interno a packages/db (allowlist doc 09 §3.2).

import { prismaSemTenant } from "../unsafe";
import { verificarSenha, type SessaoPayload, type LoginInput } from "@atende/core";

export interface VinculoDisponivel {
  empresaId: string;
  empresaNome: string;
  papelId: string;
  papelNome: string;
}

export interface ResultadoLogin {
  usuarioId: string;
  nome: string;
  vinculos: VinculoDisponivel[];
}

// Passo 1: valida credenciais e lista os tenants a que o usuário pertence.
// Não emite sessão ainda — se houver mais de um vínculo, o web pergunta qual.
export async function autenticar(input: LoginInput): Promise<ResultadoLogin | null> {
  const usuario = await prismaSemTenant.usuario.findUnique({
    where: { email: input.email },
  });
  // deletedAt: soft-delete — usuário excluído não autentica
  if (!usuario || usuario.deletedAt) return null;

  const senhaOk = await verificarSenha(input.senha, usuario.senhaHash);
  if (!senhaOk) return null;

  const vinculos = await prismaSemTenant.vinculoUsuarioEmpresa.findMany({
    where: { usuarioId: usuario.id, ativo: true },
    include: { empresa: { select: { nome: true, ativa: true } }, papel: { select: { nome: true } } },
  });

  return {
    usuarioId: usuario.id,
    nome: usuario.nome,
    vinculos: vinculos
      .filter((v) => v.empresa.ativa)
      .map((v) => ({
        empresaId: v.empresaId,
        empresaNome: v.empresa.nome,
        papelId: v.papelId,
        papelNome: v.papel.nome,
      })),
  };
}

// Passo 2: monta o payload de sessão para um vínculo específico, materializando
// os escopos do papel (doc 02 §13, nota 1 — escopos viajam no JWT).
export async function montarSessao(
  usuarioId: string,
  empresaId: string,
): Promise<SessaoPayload | null> {
  const vinculo = await prismaSemTenant.vinculoUsuarioEmpresa.findFirst({
    where: { usuarioId, empresaId, ativo: true },
  });
  if (!vinculo) return null;

  const papelEscopos = await prismaSemTenant.papelEscopo.findMany({
    where: { empresaId, papelId: vinculo.papelId },
    select: { escopoChave: true },
  });

  return {
    usuarioId,
    empresaId,
    papelId: vinculo.papelId,
    escopos: papelEscopos.map((pe) => pe.escopoChave),
  };
}
