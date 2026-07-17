// Autenticação: valida email+senha, resolve o vínculo de tenant do usuário e
// monta o payload de sessão (com os escopos materializados do PapelEscopo).
// Login também é pré-tenant (o usuário ainda não "escolheu" empresa), então
// usa prismaSemTenant interno a packages/db (allowlist doc 09 §3.2).

import { prismaSemTenant } from "../unsafe.js";
import { verificarSenha, hashSenha, type SessaoPayload, type LoginInput } from "@atende/core";

// Hash-isca para e-mail inexistente: sem ele, o login de e-mail desconhecido
// retornaria em ~0ms vs ~100ms do argon2 — um relógio distingue quais e-mails
// têm conta (enumeração por timing). Gerado uma vez, sob demanda.
let hashIsca: string | null = null;
async function obterHashIsca(): Promise<string> {
  if (!hashIsca) hashIsca = await hashSenha("senha-isca-anti-enumeracao");
  return hashIsca;
}

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
  // deletedAt: soft-delete — usuário excluído não autentica.
  // Verificação-isca mantém o tempo de resposta igual ao caminho real.
  if (!usuario || usuario.deletedAt) {
    await verificarSenha(input.senha, await obterHashIsca());
    return null;
  }

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
  // empresa.ativa aqui é o chokepoint: login, aceite de convite e (futuro)
  // troca de empresa passam todos por montarSessao — tenant suspenso não
  // emite sessão por nenhum caminho.
  const vinculo = await prismaSemTenant.vinculoUsuarioEmpresa.findFirst({
    where: { usuarioId, empresaId, ativo: true },
    include: { empresa: { select: { ativa: true } } },
  });
  if (!vinculo || !vinculo.empresa.ativa) return null;

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
