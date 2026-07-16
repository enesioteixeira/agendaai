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
    const parsed = bloqueioSchema.safeParse({
      tipo: formData.get("tipo"),
      profissionalId: alvoTipo === "profissional" ? alvoId : undefined,
      recursoId: alvoTipo === "recurso" ? alvoId : undefined,
      unidadeId: alvoTipo === "unidade" ? alvoId : undefined,
      inicio: formData.get("inicio"),
      fim: formData.get("fim"),
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
