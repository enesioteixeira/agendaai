"use server";

// Server Action da booking pública (B4). SEM sessão: o tenant vem do slug
// (única superfície slug→tenant, doc 09). Validação Zod na borda (regra 14);
// conflito de horário é resposta do banco (23P01 → mensagem de negócio).

import { redirect } from "next/navigation";
import { z } from "zod";
import { criarAgendamentoBooking } from "@atende/db";

const bookingSchema = z.object({
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/),
  servicoId: z.string().min(1),
  profissionalId: z.string().min(1),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  clienteNome: z.string().min(2).max(120),
  clienteTelefone: z.string().regex(/^\+?\d{10,15}$/, "Telefone inválido (só dígitos, com DDD)"),
});

export interface EstadoBooking {
  erro?: string;
}

export async function agendarBookingAction(
  _prev: EstadoBooking,
  formData: FormData,
): Promise<EstadoBooking> {
  const parsed = bookingSchema.safeParse({
    slug: formData.get("slug"),
    servicoId: formData.get("servicoId"),
    profissionalId: formData.get("profissionalId"),
    data: formData.get("data"),
    hora: formData.get("hora"),
    clienteNome: formData.get("clienteNome"),
    clienteTelefone: String(formData.get("clienteTelefone") ?? "").replace(/[^\d+]/g, ""),
  });
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  let agendamentoId: string;
  try {
    const r = await criarAgendamentoBooking(parsed.data);
    agendamentoId = r.agendamentoId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("23P01") || msg.includes("sem_sobreposicao")) {
      return { erro: "Esse horário acabou de ser ocupado — escolha outro." };
    }
    return { erro: msg };
  }
  redirect(`/agendar/${parsed.data.slug}/confirmado?id=${agendamentoId}`);
}
