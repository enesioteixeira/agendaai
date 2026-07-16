// Contratos Zod do atendimento (doc 05 §1.2) — o formato canônico é o
// CONTRATO entre apps/web e apps/worker (regra 14: Zod em toda borda; os
// schemas vivem aqui e packages/canais deriva os tipos). Toda mensagem que
// cruza processo (webhook → fila, painel → fila de envio) valida por aqui.

import { z } from "zod";

export const tipoCanalSchema = z.enum([
  "whatsapp_oficial",
  "whatsapp_baileys",
  "instagram",
  "messenger",
  "telegram",
  "webchat",
  "email",
]);

export const tipoIdentidadeExternaSchema = z.enum([
  "telefone", // E.164 — mapeia p/ TipoIdentidade.whatsapp (tabela canônica doc 02 §4)
  "instagram_id",
  "messenger_id",
  "telegram_id",
  "email",
  "webchat_visitor",
]);

export const tipoMensagemCanonicaSchema = z.enum([
  "texto",
  "imagem",
  "audio",
  "video",
  "documento",
  "localizacao",
  "interativo",
]);

export const midiaInboundSchema = z.object({
  url: z.string().min(1), // já em R2 — URLs de provedor expiram (doc 05 §1.2)
  mimeType: z.string().min(1),
  tamanhoBytes: z.number().int().min(0),
  nomeArquivo: z.string().optional(),
});

// Inbound normalizada: o que o conector entrega aos motores. empresaId/canalId
// vêm do REGISTRO do canal (rota do webhook / dono do socket), nunca do
// payload (regra inviolável 3).
export const mensagemInboundSchema = z.object({
  empresaId: z.string().min(1),
  canalId: z.string().min(1),
  identidadeExterna: z.object({
    tipo: tipoIdentidadeExternaSchema,
    valor: z.string().min(1),
  }),
  tipo: tipoMensagemCanonicaSchema,
  texto: z.string().optional(),
  midia: z.array(midiaInboundSchema).default([]),
  idExterno: z.string().min(1), // dedup @@unique([empresaId, canalId, idExterno])
  respostaA: z.string().optional(),
  timestamp: z.coerce.date(),
});

export const botaoOutboundSchema = z.object({
  payload: z.string().min(1),
  rotulo: z.string().min(1),
});

// Outbound: o que os motores/painel pedem ao conector. templateProativo só
// é aceito por conectores com capacidades.templates === true — no Baileys o
// caminho NÃO existe (restrição estrutural, regra inviolável 12).
export const mensagemOutboundSchema = z.object({
  empresaId: z.string().min(1),
  canalId: z.string().min(1),
  conversaId: z.string().min(1),
  texto: z.string().min(1),
  botoes: z.array(botaoOutboundSchema).optional(),
  lista: z.object({ titulo: z.string().min(1), itens: z.array(botaoOutboundSchema) }).optional(),
  midia: z.array(midiaInboundSchema).optional(),
  templateProativo: z
    .object({ nome: z.string().min(1), variaveis: z.record(z.string(), z.string()) })
    .optional(),
});

// Jobs das filas (pg-boss) — payloads validados nas DUAS pontas.
export const jobInboundSchema = z.object({
  mensagem: mensagemInboundSchema,
});

export const jobEnviarSchema = z.object({
  mensagem: mensagemOutboundSchema,
  // Mensagem gravada como `pendente` ANTES de enfileirar; o worker atualiza
  // statusEntrega/idExterno após o envio (correlação).
  mensagemId: z.string().min(1),
});

export type TipoCanalCanonico = z.infer<typeof tipoCanalSchema>;
export type TipoIdentidadeExterna = z.infer<typeof tipoIdentidadeExternaSchema>;
export type MidiaInbound = z.infer<typeof midiaInboundSchema>;
export type MensagemInboundNormalizada = z.infer<typeof mensagemInboundSchema>;
export type BotaoOutbound = z.infer<typeof botaoOutboundSchema>;
export type MensagemOutbound = z.infer<typeof mensagemOutboundSchema>;
export type JobInbound = z.infer<typeof jobInboundSchema>;
export type JobEnviar = z.infer<typeof jobEnviarSchema>;
