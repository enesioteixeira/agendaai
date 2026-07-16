// Contratos Zod do domínio agenda (Bloco 2). Tipos derivam daqui (z.infer) —
// nunca o contrário (doc 09 §3.4). Toda Server Action de agenda valida o input
// por estes schemas (regra inviolável 14).

import { z } from "zod";

export const tipoRecursoSchema = z.enum(["sala", "cadeira", "equipamento"]);
export const tipoBloqueioSchema = z.enum(["ferias", "almoco", "manutencao", "outro"]);

const id = z.string().min(1);
const horaHHmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (use HH:mm)");

export const servicoSchema = z.object({
  nome: z.string().min(2).max(120),
  duracaoMin: z.coerce.number().int().min(5, "Duração mínima: 5 min").max(8 * 60),
  // Valor SEMPRE em centavos (regra inviolável 16) — o form envia reais e a
  // action converte (Math.round(reais * 100)) ANTES de validar.
  precoCentavos: z.coerce.number().int().min(0),
  exigeSinal: z.coerce.boolean().default(false),
  percentualSinalBp: z.coerce.number().int().min(1).max(10_000).optional(),
  visivelNaBooking: z.coerce.boolean().default(true),
});

export const profissionalSchema = z.object({
  nome: z.string().min(2).max(120),
  unidadeId: id,
  cor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida")
    .optional(),
});

export const recursoSchema = z.object({
  nome: z.string().min(2).max(120),
  unidadeId: id,
  tipo: tipoRecursoSchema,
  capacidade: z.coerce.number().int().min(1).max(999).default(1),
});

// Bloqueio: EXATAMENTE UM alvo entre profissional/recurso/unidade — a regra
// vive aqui (doc 02 §3: check em código, não em constraint).
export const bloqueioSchema = z
  .object({
    tipo: tipoBloqueioSchema,
    profissionalId: id.optional(),
    recursoId: id.optional(),
    unidadeId: id.optional(),
    inicio: z.coerce.date(),
    fim: z.coerce.date(),
    motivo: z.string().max(300).optional(),
  })
  .refine((b) => [b.profissionalId, b.recursoId, b.unidadeId].filter(Boolean).length === 1, {
    message: "Escolha exatamente um alvo: profissional, sala/recurso ou unidade inteira.",
  })
  .refine((b) => b.fim > b.inicio, { message: "O fim deve ser depois do início." });

const intervaloTrabalhoSchema = z
  .object({
    diaSemana: z.coerce.number().int().min(0).max(6), // 0 = domingo
    horaInicio: horaHHmm,
    horaFim: horaHHmm,
  })
  .refine((i) => i.horaFim > i.horaInicio, {
    message: "Hora final deve ser depois da inicial.",
  });

// Grade semanal do profissional — substituição integral (replace-all): o form
// envia a grade completa e a action troca em transação. Permite grade quebrada
// (manhã + tarde = duas linhas no mesmo dia — doc 02 §3).
export const horariosTrabalhoSchema = z.object({
  profissionalId: id,
  unidadeId: id,
  intervalos: z.array(intervaloTrabalhoSchema).max(28),
});

// Horários de funcionamento da unidade (Unidade.horariosFuncionamento Json):
// mesma forma de intervalo do trabalho, sem profissional.
export const horariosFuncionamentoSchema = z.object({
  unidadeId: id,
  intervalos: z.array(intervaloTrabalhoSchema).max(28),
});

// Novo agendamento pelo painel (B3). Cliente: um existente (clienteId) OU um
// novo (nome obrigatório; telefone recomendado — vira o pivô do omnichannel).
export const agendamentoCriarSchema = z
  .object({
    profissionalId: id,
    servicoId: id,
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    hora: horaHHmm,
    clienteId: id.optional(),
    clienteNome: z.string().min(2).max(120).optional(),
    clienteTelefone: z
      .string()
      .regex(/^\+?\d{10,15}$/, "Telefone inválido (só dígitos, com DDD)")
      .optional(),
    observacoes: z.string().max(500).optional(),
  })
  .refine((a) => a.clienteId || a.clienteNome, {
    message: "Escolha um cliente ou informe o nome de um novo.",
  });

export const clienteCriarSchema = z.object({
  nome: z.string().min(2).max(120),
  telefone: z
    .string()
    .regex(/^\+?\d{10,15}$/, "Telefone inválido (só dígitos, com DDD)")
    .optional(),
  email: z.string().email("E-mail inválido").optional(),
  observacoes: z.string().max(500).optional(),
});

export type AgendamentoCriarInput = z.infer<typeof agendamentoCriarSchema>;
export type ClienteCriarInput = z.infer<typeof clienteCriarSchema>;
export type ServicoInput = z.infer<typeof servicoSchema>;
export type ProfissionalInput = z.infer<typeof profissionalSchema>;
export type RecursoInput = z.infer<typeof recursoSchema>;
export type BloqueioInput = z.infer<typeof bloqueioSchema>;
export type HorariosTrabalhoInput = z.infer<typeof horariosTrabalhoSchema>;
export type HorariosFuncionamentoInput = z.infer<typeof horariosFuncionamentoSchema>;
