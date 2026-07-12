import type { z } from "zod";
import type {
  sessaoPayloadSchema,
  criarEmpresaSchema,
  convidarUsuarioSchema,
  cadastroInicialSchema,
  loginSchema,
  verticalEmpresaSchema,
} from "./schemas";

export type SessaoPayload = z.infer<typeof sessaoPayloadSchema>;
export type CriarEmpresaInput = z.infer<typeof criarEmpresaSchema>;
export type ConvidarUsuarioInput = z.infer<typeof convidarUsuarioSchema>;
export type CadastroInicialInput = z.infer<typeof cadastroInicialSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerticalEmpresa = z.infer<typeof verticalEmpresaSchema>;
