// Serviços da booking pública (B4 — doc 04 §2.3). A identidade do tenant vem
// do resolver slug→empresaId (única superfície onde isso é permitido); daqui
// pra dentro tudo roda sob runWithTenant — a extension continua injetando o
// empresaId em toda query (regra 1).

import {
  slotsLivres,
  paraUtc,
  adicionarMinutos,
  type IntervaloDia,
} from "@atende/core";
import { prisma } from "../client";
import { runWithTenant } from "../tenancy";
import { resolverEmpresaPorSlug, type EmpresaResolvida } from "../resolver-slug";

export interface CatalogoBooking {
  empresa: EmpresaResolvida;
  servicos: { id: string; nome: string; duracaoMin: number; precoCentavos: number }[];
  profissionais: { id: string; nome: string; unidadeId: string }[];
}

/** Catálogo público do tenant: serviços visíveis + profissionais ativos. */
export async function catalogoBooking(slug: string): Promise<CatalogoBooking | null> {
  const empresa = await resolverEmpresaPorSlug(slug);
  if (!empresa) return null;
  return runWithTenant({ empresaId: empresa.empresaId }, async () => {
    const [servicos, profissionais] = await Promise.all([
      prisma.servico.findMany({
        where: { ativo: true, visivelNaBooking: true },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, duracaoMin: true, precoCentavos: true },
      }),
      prisma.profissional.findMany({
        where: { ativo: true, deletedAt: null },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, unidadeId: true },
      }),
    ]);
    return { empresa, servicos, profissionais };
  });
}

/** Slots livres de um profissional para um serviço numa data ("HH:mm"). */
export async function slotsBooking(
  slug: string,
  servicoId: string,
  profissionalId: string,
  data: string,
): Promise<{ fuso: string; slots: string[] } | null> {
  const empresa = await resolverEmpresaPorSlug(slug);
  if (!empresa) return null;
  return runWithTenant({ empresaId: empresa.empresaId }, async () => {
    const [servico, profissional] = await Promise.all([
      prisma.servico.findUnique({ where: { id: servicoId } }),
      prisma.profissional.findUnique({
        where: { id: profissionalId },
        include: { unidade: true, horarios: true },
      }),
    ]);
    if (!servico?.ativo || !servico.visivelNaBooking) return null;
    if (!profissional || profissional.deletedAt || !profissional.ativo) return null;

    const fuso = profissional.unidade.fusoHorario;
    const inicioDia = paraUtc(data, "00:00", fuso);
    const fimDia = paraUtc(data, "23:59", fuso);

    const [ocupados, bloqueios] = await Promise.all([
      prisma.agendamento.findMany({
        where: {
          profissionalId,
          status: { in: ["agendado", "confirmado", "em_atendimento"] },
          inicio: { lte: fimDia },
          fim: { gte: inicioDia },
        },
        select: { inicio: true, fim: true },
      }),
      prisma.bloqueio.findMany({
        where: {
          inicio: { lte: fimDia },
          fim: { gte: inicioDia },
          OR: [{ profissionalId }, { unidadeId: profissional.unidadeId }],
        },
        select: { inicio: true, fim: true },
      }),
    ]);

    const funcionamento = Array.isArray(profissional.unidade.horariosFuncionamento)
      ? (profissional.unidade.horariosFuncionamento as unknown as IntervaloDia[])
      : [];

    return {
      fuso,
      slots: slotsLivres({
        data,
        fuso,
        duracaoMin: servico.duracaoMin,
        gradeTrabalho: profissional.horarios,
        funcionamento,
        ocupados,
        bloqueios,
      }),
    };
  });
}

export interface BookingCriada {
  agendamentoId: string;
  inicio: Date;
  fim: Date;
  servicoNome: string;
  profissionalNome: string;
  fuso: string;
}

/**
 * Cria o agendamento vindo da booking pública. Cliente é resolvido pelo
 * telefone (dedup por tenant); não existindo, nasce provisório NA MESMA
 * transação do agendamento. Conflito de horário estoura 23P01 (exclusion
 * constraint) — o chamador traduz em "horário acabou de ser ocupado".
 */
export async function criarAgendamentoBooking(input: {
  slug: string;
  servicoId: string;
  profissionalId: string;
  data: string;
  hora: string;
  clienteNome: string;
  clienteTelefone: string;
}): Promise<BookingCriada> {
  const empresa = await resolverEmpresaPorSlug(input.slug);
  if (!empresa) throw new Error("Página de agendamento não encontrada.");

  return runWithTenant({ empresaId: empresa.empresaId }, async () => {
    const [servico, profissional] = await Promise.all([
      prisma.servico.findUnique({ where: { id: input.servicoId } }),
      prisma.profissional.findUnique({
        where: { id: input.profissionalId },
        include: { unidade: true },
      }),
    ]);
    if (!servico?.ativo || !servico.visivelNaBooking) throw new Error("Serviço indisponível.");
    if (!profissional || profissional.deletedAt || !profissional.ativo) {
      throw new Error("Profissional indisponível.");
    }

    const fuso = profissional.unidade.fusoHorario;
    const inicio = paraUtc(input.data, input.hora, fuso);
    const fim = adicionarMinutos(inicio, servico.duracaoMin);
    if (inicio <= new Date()) throw new Error("Esse horário já passou — escolha outro.");

    const agendamento = await prisma.$transaction(async (tx) => {
      // bloqueio revalidado dentro da transação (doc 02 §3.1)
      const bloqueado = await tx.bloqueio.findFirst({
        where: {
          inicio: { lt: fim },
          fim: { gt: inicio },
          OR: [{ profissionalId: input.profissionalId }, { unidadeId: profissional.unidadeId }],
        },
      });
      if (bloqueado) throw new Error("Esse horário acabou de ficar indisponível — escolha outro.");

      // dedup por telefone dentro do tenant; senão, cliente provisório
      const existente = await tx.cliente.findFirst({
        where: { telefone: input.clienteTelefone, deletedAt: null },
      });
      const clienteId =
        existente?.id ??
        (
          await tx.cliente.create({
            data: {
              nome: input.clienteNome,
              telefone: input.clienteTelefone,
              provisorio: true,
            } as never,
          })
        ).id;

      return tx.agendamento.create({
        data: {
          unidadeId: profissional.unidadeId,
          clienteId,
          profissionalId: input.profissionalId,
          servicoId: input.servicoId,
          inicio,
          fim,
          origem: "booking",
        } as never,
      });
    });

    return {
      agendamentoId: agendamento.id,
      inicio,
      fim,
      servicoNome: servico.nome,
      profissionalNome: profissional.nome,
      fuso,
    };
  });
}
