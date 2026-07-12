// Contratos Zod do domínio identidade. Os tipos derivam daqui (z.infer) —
// nunca o contrário (doc 09 §3.4). Este schema é o contrato entre
// apps/web (emissão de sessão) e apps/worker (verificação p/ SSE).

import { z } from "zod";

export const verticalEmpresaSchema = z.enum([
  "salao",
  "barbearia",
  "clinica_estetica",
  "clinica_medica",
  "advocacia",
  "outro",
]);

// Payload da sessão JWT (doc 01 §5.3): a identidade do tenant vem SEMPRE
// daqui — nunca de input do cliente, URL ou saída de IA (regra inviolável 3).
export const sessaoPayloadSchema = z.object({
  usuarioId: z.string().min(1),
  empresaId: z.string().min(1),
  unidadeId: z.string().min(1).optional(),
  papelId: z.string().min(1),
  escopos: z.array(z.string().regex(/^[a-z]+:[a-z-]+$/)), // ex.: "agenda:criar"
});

export const criarEmpresaSchema = z.object({
  nome: z.string().min(2).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/, "slug inválido (minúsculas, números e hífen)"),
  vertical: verticalEmpresaSchema,
  cnpj: z.string().optional(),
});

export const convidarUsuarioSchema = z.object({
  email: z.string().email(),
  papelId: z.string().min(1),
  unidadesPermitidas: z.array(z.string()).default([]),
});
