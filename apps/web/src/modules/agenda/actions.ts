"use server";

// Server Actions do CRUD da agenda (Bloco 2 — doc 04 §2.3). Padrão de toda
// action: sessão JWT → guard de escopo (agenda:configurar, matriz doc 02 §13)
// → Zod de @atende/core (regra 14) → runWithTenant (a extension injeta o
// empresaId — NUNCA à mão, regra 1) → revalidatePath.

import { revalidatePath } from "next/cache";
import {
  temEscopo,
  servicoSchema,
  profissionalSchema,
  recursoSchema,
  bloqueioSchema,
  horariosTrabalhoSchema,
  horariosFuncionamentoSchema,
  agendamentoCriarSchema,
  paraUtc,
  adicionarMinutos,
  type SessaoPayload,
} from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { lerSessao } from "@/lib/sessao";

export interface EstadoAgendaForm {
  erro?: string;
  ok?: boolean;
}

// Guard comum: sessão válida + escopo de configuração da agenda.
async function exigirConfigurador(): Promise<SessaoPayload> {
  const sessao = await lerSessao();
  if (!sessao) throw new Error("Sessão expirada — entre novamente.");
  if (!temEscopo(sessao, "agenda:configurar")) {
    throw new Error("Seu papel não pode configurar a agenda (escopo agenda:configurar).");
  }
  return sessao;
}

function comoEstado(fn: () => Promise<void>): Promise<EstadoAgendaForm> {
  return fn()
    .then(() => ({ ok: true }) as EstadoAgendaForm)
    .catch((e) => ({ erro: e instanceof Error ? e.message : "Erro inesperado." }));
}

function contexto(sessao: SessaoPayload) {
  return { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId };
}

// ── Serviços ─────────────────────────────────────────────────

export async function servicoSalvarAction(
  _prev: EstadoAgendaForm,
  formData: FormData,
): Promise<EstadoAgendaForm> {
  return comoEstado(async () => {
    const sessao = await exigirConfigurador();
    const parsed = servicoSchema.safeParse({
      nome: formData.get("nome"),
      duracaoMin: formData.get("duracaoMin"),
      // form envia reais; centavos Int no banco (regra 16)
      precoCentavos: Math.round(Number(String(formData.get("precoReais") ?? "0").replace(",", ".")) * 100),
      exigeSinal: formData.get("exigeSinal") === "on",
      percentualSinalBp: formData.get("percentualSinalBp") || undefined,
      visivelNaBooking: formData.get("visivelNaBooking") === "on",
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const idExistente = String(formData.get("id") ?? "");
    await runWithTenant(contexto(sessao), async () => {
      if (idExistente) {
        await prisma.servico.update({ where: { id: idExistente }, data: parsed.data });
      } else {
        await prisma.servico.create({ data: parsed.data as never });
      }
    });
    revalidatePath("/agenda/servicos");
  });
}

export async function servicoAlternarAtivoAction(formData: FormData): Promise<void> {
  const sessao = await exigirConfigurador();
  const servicoId = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  await runWithTenant(contexto(sessao), async () => {
    await prisma.servico.update({ where: { id: servicoId }, data: { ativo } });
  });
  revalidatePath("/agenda/servicos");
}

// ── Profissionais ────────────────────────────────────────────

export async function profissionalSalvarAction(
  _prev: EstadoAgendaForm,
  formData: FormData,
): Promise<EstadoAgendaForm> {
  return comoEstado(async () => {
    const sessao = await exigirConfigurador();
    const parsed = profissionalSchema.safeParse({
      nome: formData.get("nome"),
      unidadeId: formData.get("unidadeId"),
      cor: formData.get("cor") || undefined,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const idExistente = String(formData.get("id") ?? "");
    await runWithTenant(contexto(sessao), async () => {
      // unidade precisa ser do tenant — findUnique com a extension confina ao tenant
      const unidade = await prisma.unidade.findUnique({ where: { id: parsed.data.unidadeId } });
      if (!unidade) throw new Error("Unidade não encontrada.");
      if (idExistente) {
        await prisma.profissional.update({ where: { id: idExistente }, data: parsed.data });
      } else {
        await prisma.profissional.create({ data: parsed.data as never });
      }
    });
    revalidatePath("/agenda/profissionais");
  });
}

export async function profissionalAlternarAtivoAction(formData: FormData): Promise<void> {
  const sessao = await exigirConfigurador();
  const profissionalId = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  await runWithTenant(contexto(sessao), async () => {
    await prisma.profissional.update({ where: { id: profissionalId }, data: { ativo } });
  });
  revalidatePath("/agenda/profissionais");
}

// Grade semanal (replace-all em transação): o form envia a grade completa.
export async function horariosTrabalhoSalvarAction(
  _prev: EstadoAgendaForm,
  formData: FormData,
): Promise<EstadoAgendaForm> {
  return comoEstado(async () => {
    const sessao = await exigirConfigurador();
    // linhas serializadas pelo form como "dia|inicio|fim" (uma por intervalo)
    const intervalos = formData
      .getAll("intervalo")
      .map(String)
      .filter(Boolean)
      .map((linha) => {
        const [diaSemana, horaInicio, horaFim] = linha.split("|");
        return { diaSemana, horaInicio, horaFim };
      });
    const parsed = horariosTrabalhoSchema.safeParse({
      profissionalId: formData.get("profissionalId"),
      unidadeId: formData.get("unidadeId"),
      intervalos,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Grade inválida.");

    const { profissionalId, unidadeId } = parsed.data;
    await runWithTenant(contexto(sessao), async () => {
      const profissional = await prisma.profissional.findUnique({ where: { id: profissionalId } });
      if (!profissional) throw new Error("Profissional não encontrado.");
      await prisma.$transaction([
        prisma.horarioTrabalho.deleteMany({ where: { profissionalId } }),
        ...(parsed.data.intervalos.length
          ? [
              prisma.horarioTrabalho.createMany({
                data: parsed.data.intervalos.map((i) => ({
                  profissionalId,
                  unidadeId,
                  ...i,
                })) as never,
              }),
            ]
          : []),
      ]);
    });
    revalidatePath("/agenda/profissionais");
  });
}

// ── Salas / recursos ─────────────────────────────────────────

export async function recursoSalvarAction(
  _prev: EstadoAgendaForm,
  formData: FormData,
): Promise<EstadoAgendaForm> {
  return comoEstado(async () => {
    const sessao = await exigirConfigurador();
    const parsed = recursoSchema.safeParse({
      nome: formData.get("nome"),
      unidadeId: formData.get("unidadeId"),
      tipo: formData.get("tipo"),
      capacidade: formData.get("capacidade") || 1,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const idExistente = String(formData.get("id") ?? "");
    await runWithTenant(contexto(sessao), async () => {
      if (idExistente) {
        await prisma.recurso.update({ where: { id: idExistente }, data: parsed.data });
      } else {
        await prisma.recurso.create({ data: parsed.data as never });
      }
    });
    revalidatePath("/agenda/recursos");
  });
}

export async function recursoAlternarAtivoAction(formData: FormData): Promise<void> {
  const sessao = await exigirConfigurador();
  const recursoId = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  await runWithTenant(contexto(sessao), async () => {
    await prisma.recurso.update({ where: { id: recursoId }, data: { ativo } });
  });
  revalidatePath("/agenda/recursos");
}

// ── Bloqueios ────────────────────────────────────────────────

export async function bloqueioCriarAction(
  _prev: EstadoAgendaForm,
  formData: FormData,
): Promise<EstadoAgendaForm> {
  return comoEstado(async () => {
    const sessao = await exigirConfigurador();
    // o form manda um único campo alvo "tipo:id" — decompõe p/ o schema
    const alvo = String(formData.get("alvo") ?? "");
    const [alvoTipo, alvoId] = alvo.split(":");

    // datetime-local é horário de PAREDE ("2026-07-20T09:00", sem fuso) — a
    // conversão p/ UTC usa o fuso da unidade do alvo (regra 16). new Date()
    // cru interpretaria como UTC no workerd e deslocaria o bloqueio em -3h.
    const paraInstante = async (bruto: string): Promise<Date | undefined> => {
      const m = bruto.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
      if (!m || !m[1] || !m[2]) return undefined;
      const fuso = await fusoDoAlvo(alvoTipo, alvoId);
      return paraUtc(m[1], m[2], fuso);
    };

    const fusoDoAlvo = async (tipo: string | undefined, id: string | undefined): Promise<string> => {
      if (!id) return "America/Sao_Paulo";
      if (tipo === "unidade") {
        const u = await prisma.unidade.findUnique({ where: { id } });
        return u?.fusoHorario ?? "America/Sao_Paulo";
      }
      if (tipo === "profissional") {
        const p = await prisma.profissional.findUnique({ where: { id }, include: { unidade: true } });
        return p?.unidade.fusoHorario ?? "America/Sao_Paulo";
      }
      const r = await prisma.recurso.findUnique({ where: { id }, include: { unidade: true } });
      return r?.unidade.fusoHorario ?? "America/Sao_Paulo";
    };

    const { inicio, fim } = await runWithTenant(contexto(sessao), async () => ({
      inicio: await paraInstante(String(formData.get("inicio") ?? "")),
      fim: await paraInstante(String(formData.get("fim") ?? "")),
    }));

    const parsed = bloqueioSchema.safeParse({
      tipo: formData.get("tipo"),
      profissionalId: alvoTipo === "profissional" ? alvoId : undefined,
      recursoId: alvoTipo === "recurso" ? alvoId : undefined,
      unidadeId: alvoTipo === "unidade" ? alvoId : undefined,
      inicio,
      fim,
      motivo: formData.get("motivo") || undefined,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    await runWithTenant(contexto(sessao), async () => {
      await prisma.bloqueio.create({ data: parsed.data as never });
    });
    revalidatePath("/agenda/recursos");
  });
}

export async function bloqueioExcluirAction(formData: FormData): Promise<void> {
  const sessao = await exigirConfigurador();
  const bloqueioId = String(formData.get("id") ?? "");
  await runWithTenant(contexto(sessao), async () => {
    await prisma.bloqueio.delete({ where: { id: bloqueioId } });
  });
  revalidatePath("/agenda/recursos");
}

// ── Agendamentos (B3) ────────────────────────────────────────

async function exigirEscopo(escopo: string): Promise<SessaoPayload> {
  const sessao = await lerSessao();
  if (!sessao) throw new Error("Sessão expirada — entre novamente.");
  if (!temEscopo(sessao, escopo)) {
    throw new Error(`Seu papel não tem o escopo ${escopo}.`);
  }
  return sessao;
}

export async function agendamentoCriarAction(
  _prev: EstadoAgendaForm,
  formData: FormData,
): Promise<EstadoAgendaForm> {
  return comoEstado(async () => {
    const sessao = await exigirEscopo("agenda:criar");
    const parsed = agendamentoCriarSchema.safeParse({
      profissionalId: formData.get("profissionalId"),
      servicoId: formData.get("servicoId"),
      data: formData.get("data"),
      hora: formData.get("hora"),
      clienteId: formData.get("clienteId") || undefined,
      clienteNome: formData.get("clienteNome") || undefined,
      clienteTelefone: String(formData.get("clienteTelefone") ?? "").replace(/[^\d+]/g, "") || undefined,
      observacoes: formData.get("observacoes") || undefined,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const d = parsed.data;

    await runWithTenant(contexto(sessao), async () => {
      const [profissional, servico] = await Promise.all([
        prisma.profissional.findUnique({ where: { id: d.profissionalId }, include: { unidade: true } }),
        prisma.servico.findUnique({ where: { id: d.servicoId } }),
      ]);
      if (!profissional || profissional.deletedAt || !profissional.ativo) {
        throw new Error("Profissional não encontrado ou inativo.");
      }
      if (!servico || !servico.ativo) throw new Error("Serviço não encontrado ou inativo.");

      // horário de parede no fuso da unidade → instante UTC (regra 16)
      const inicio = paraUtc(d.data, d.hora, profissional.unidade.fusoHorario);
      const fim = adicionarMinutos(inicio, servico.duracaoMin);

      // cliente existente é validado antes; cliente NOVO nasce DENTRO da
      // transação do agendamento — se o horário conflitar, o rollback desfaz
      // o cliente junto (sem órfão no cadastro).
      if (d.clienteId) {
        const existente = await prisma.cliente.findUnique({ where: { id: d.clienteId } });
        if (!existente || existente.deletedAt) throw new Error("Cliente não encontrado.");
      } else if (!temEscopo(sessao, "clientes:criar")) {
        throw new Error("Seu papel não pode cadastrar cliente novo (escopo clientes:criar).");
      }

      try {
        // Revalidação transacional de bloqueio + escrita: a corrida
        // agendamento×agendamento é do banco (exclusion constraint); a corrida
        // bloqueio×agendamento é resolvida aqui (doc 02 §3.1).
        await prisma.$transaction(async (tx) => {
          const bloqueado = await tx.bloqueio.findFirst({
            where: {
              inicio: { lt: fim },
              fim: { gt: inicio },
              OR: [{ profissionalId: d.profissionalId }, { unidadeId: profissional.unidadeId }],
            },
          });
          if (bloqueado) throw new Error("Período bloqueado para esse profissional/unidade.");
          const clienteId =
            d.clienteId ??
            (
              await tx.cliente.create({
                data: { nome: d.clienteNome, telefone: d.clienteTelefone } as never,
              })
            ).id;
          await tx.agendamento.create({
            data: {
              unidadeId: profissional.unidadeId,
              clienteId,
              profissionalId: d.profissionalId,
              servicoId: d.servicoId,
              inicio,
              fim,
              origem: "painel",
              observacoes: d.observacoes,
            } as never,
          });
        });
      } catch (e) {
        // 23P01 = exclusion constraint: resposta de negócio, não erro (doc 02 §3.1)
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("23P01") || msg.includes("sem_sobreposicao")) {
          throw new Error("Esse horário acabou de ser ocupado — escolha outro.");
        }
        throw e;
      }
    });
    revalidatePath("/agenda");
  });
}

export async function agendamentoStatusAction(formData: FormData): Promise<void> {
  const alvo = String(formData.get("status") ?? "");
  const agendamentoId = String(formData.get("id") ?? "");
  const sessao = await exigirEscopo(alvo === "cancelado" ? "agenda:cancelar" : "agenda:criar");
  if (!["cancelado", "concluido", "confirmado", "nao_compareceu"].includes(alvo)) {
    throw new Error("Transição de status inválida.");
  }
  await runWithTenant(contexto(sessao), async () => {
    await prisma.agendamento.update({
      where: { id: agendamentoId },
      data:
        alvo === "cancelado"
          ? { status: "cancelado", canceladoEm: new Date(), motivoCancelamento: String(formData.get("motivo") ?? "") || null }
          : { status: alvo as never },
    });
  });
  revalidatePath("/agenda");
}

// ── Clientes (mínimo p/ agenda — módulo completo no Bloco 3) ─

export async function clienteCriarAction(
  _prev: EstadoAgendaForm,
  formData: FormData,
): Promise<EstadoAgendaForm> {
  return comoEstado(async () => {
    const sessao = await exigirEscopo("clientes:criar");
    const { clienteCriarSchema } = await import("@atende/core");
    const parsed = clienteCriarSchema.safeParse({
      nome: formData.get("nome"),
      telefone: String(formData.get("telefone") ?? "").replace(/[^\d+]/g, "") || undefined,
      email: formData.get("email") || undefined,
      observacoes: formData.get("observacoes") || undefined,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    await runWithTenant(contexto(sessao), async () => {
      await prisma.cliente.create({ data: parsed.data as never });
    });
    revalidatePath("/clientes");
  });
}

// ── Horários de funcionamento da unidade ─────────────────────

export async function horariosFuncionamentoSalvarAction(
  _prev: EstadoAgendaForm,
  formData: FormData,
): Promise<EstadoAgendaForm> {
  return comoEstado(async () => {
    const sessao = await exigirConfigurador();
    const intervalos = formData
      .getAll("intervalo")
      .map(String)
      .filter(Boolean)
      .map((linha) => {
        const [diaSemana, horaInicio, horaFim] = linha.split("|");
        return { diaSemana, horaInicio, horaFim };
      });
    const parsed = horariosFuncionamentoSchema.safeParse({
      unidadeId: formData.get("unidadeId"),
      intervalos,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Grade inválida.");

    await runWithTenant(contexto(sessao), async () => {
      await prisma.unidade.update({
        where: { id: parsed.data.unidadeId },
        data: { horariosFuncionamento: parsed.data.intervalos },
      });
    });
    revalidatePath("/agenda/unidade");
  });
}
