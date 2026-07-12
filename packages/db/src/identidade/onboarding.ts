// Serviço de onboarding: cria empresa + unidade + papéis padrão + usuário
// admin numa transação. É um dos poucos fluxos que começa ANTES de existir
// contexto de tenant (a empresa nasce aqui), então usa prismaSemTenant DENTRO
// de packages/db (allowlist doc 09 §3.2) e carimba empresaId à mão, uma vez.

import { prismaSemTenant } from "../unsafe";
import {
  hashSenha,
  papeisPadrao,
  ESCOPOS,
  type CadastroInicialInput,
} from "@atende/core";

export interface ResultadoOnboarding {
  empresaId: string;
  usuarioId: string;
  unidadeId: string;
  papelAdminId: string;
}

// Garante que o catálogo global de escopos existe (idempotente). Roda uma vez
// no 1º onboarding; barato o suficiente para revalidar sempre.
async function garantirEscopos(): Promise<void> {
  await prismaSemTenant.escopo.createMany({
    data: ESCOPOS.map((e) => ({ chave: e.chave, modulo: e.modulo, descricao: e.descricao })),
    skipDuplicates: true,
  });
}

export async function cadastroInicial(input: CadastroInicialInput): Promise<ResultadoOnboarding> {
  await garantirEscopos();

  const senhaHash = await hashSenha(input.senha);
  const papeis = papeisPadrao(input.vertical);

  // Transação real (adapter pg com pooler — abandonamos o Neon HTTP do
  // ev-tracker justamente por isto, doc 03): se qualquer passo falhar,
  // nenhuma empresa meio-criada fica no banco.
  return prismaSemTenant.$transaction(async (tx) => {
    const empresa = await tx.empresa.create({
      data: {
        nome: input.empresaNome,
        slug: input.empresaSlug,
        vertical: input.vertical,
      },
    });

    const unidade = await tx.unidade.create({
      data: {
        empresaId: empresa.id,
        nome: input.unidadeNome,
        fusoHorario: input.fusoHorario,
      },
    });

    // Cria os 4 papéis padrão e seus PapelEscopo
    let papelAdminId = "";
    for (const p of papeis) {
      const papel = await tx.papel.create({
        data: { empresaId: empresa.id, nome: p.nome, sistema: true },
      });
      if (p.canonico === "administrador") papelAdminId = papel.id;
      await tx.papelEscopo.createMany({
        data: p.escopos.map((chave) => ({
          empresaId: empresa.id,
          papelId: papel.id,
          escopoChave: chave,
        })),
      });
    }

    // Usuário (global) — email único no sistema inteiro
    const usuario = await tx.usuario.create({
      data: { email: input.email, senhaHash, nome: input.nome },
    });

    // Vínculo do dono como administrador; unidadesPermitidas vazio = todas
    await tx.vinculoUsuarioEmpresa.create({
      data: {
        empresaId: empresa.id,
        usuarioId: usuario.id,
        papelId: papelAdminId,
        unidadesPermitidas: [],
      },
    });

    return {
      empresaId: empresa.id,
      usuarioId: usuario.id,
      unidadeId: unidade.id,
      papelAdminId,
    };
  });
}
