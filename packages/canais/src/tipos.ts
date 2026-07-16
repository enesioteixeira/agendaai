// Interface única Conector — transcrição fiel do doc 05 §1.1–1.3. Nada fora
// de packages/canais importa SDK de canal: esta é a fronteira anticorrupção.
//
// Os FORMATOS canônicos (inbound/outbound) são CONTRATO web↔worker e vivem
// como schemas Zod em @atende/core/atendimento (regra 14) — aqui só se
// derivam/reexportam os tipos e se define a interface do conector.

export type {
  TipoCanalCanonico as TipoCanal,
  TipoIdentidadeExterna,
  MidiaInbound,
  MensagemInboundNormalizada,
  BotaoOutbound,
  MensagemOutbound,
} from "@atende/core";

import type { MensagemInboundNormalizada, MensagemOutbound, TipoCanalCanonico } from "@atende/core";

export type TipoMidia = "imagem" | "audio" | "video" | "documento";

export interface CapacidadesCanal {
  botoes: boolean; // reply buttons nativos
  listas: boolean; // list messages nativas
  templates: boolean; // templates proativos (fora de janela de sessão)
  midia: TipoMidia[];
  typing: boolean;
}

export interface Conector {
  tipo: TipoCanalCanonico;
  capacidades: CapacidadesCanal;

  // Webhook bruto do provedor -> formato canônico. Valida com Zod; payload
  // inválido é rejeitado na borda, nunca chega aos motores.
  receber(webhookPayload: unknown): Promise<MensagemInboundNormalizada[]>;

  // Formato canônico -> API do provedor. Retorna o id externo para
  // idempotência, correlação de status e threading (respostaA).
  enviar(mensagem: MensagemOutbound): Promise<{ idExterno: string }>;
}
