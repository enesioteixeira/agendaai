// Interface única Conector + formatos canônicos — transcrição fiel do
// doc 05 §1.1–1.3. Nada fora de packages/canais importa SDK de canal:
// esta é a fronteira anticorrupção do módulo.

export type TipoCanal =
  | "whatsapp_oficial"
  | "whatsapp_baileys"
  | "instagram"
  | "messenger"
  | "telegram"
  | "webchat"
  | "email";

export type TipoMidia = "imagem" | "audio" | "video" | "documento";

export type TipoIdentidadeExterna =
  | "telefone" // E.164 — mapeia para TipoIdentidade.whatsapp (tabela canônica no doc 02 §4)
  | "instagram_id"
  | "messenger_id"
  | "telegram_id"
  | "email"
  | "webchat_visitor";

export interface MidiaInbound {
  url: string; // já baixada para R2 — URLs de provedor expiram (doc 05 §1.2)
  mimeType: string;
  tamanhoBytes: number;
  nomeArquivo?: string;
}

export interface MensagemInboundNormalizada {
  empresaId: string; // resolvido pelo roteador de webhook (canal -> empresa), NUNCA do payload (regra 3)
  canalId: string; // instância de canal do tenant (uma empresa pode ter N números)
  identidadeExterna: {
    tipo: TipoIdentidadeExterna;
    valor: string; // E.164 para telefone; id opaco da plataforma nos demais
  };
  tipo: "texto" | "imagem" | "audio" | "video" | "documento" | "localizacao" | "interativo";
  texto?: string; // corpo textual ou payload do botão clicado
  midia: MidiaInbound[];
  idExterno: string; // dedup por @@unique([empresaId, canalId, idExterno]) — doc 02 §5
  respostaA?: string; // idExterno da mensagem citada (reply) — essencial p/ propose-confirm
  timestamp: Date; // do provedor, em UTC
}

export interface BotaoOutbound {
  payload: string;
  rotulo: string;
}

export interface MensagemOutbound {
  empresaId: string;
  canalId: string;
  conversaId: string;
  texto: string;
  botoes?: BotaoOutbound[]; // conector degrada para lista numerada onde não há suporte (doc 05 §1.3)
  lista?: { titulo: string; itens: BotaoOutbound[] };
  midia?: MidiaInbound[];
  // Envio PROATIVO (fora de janela de sessão) só existe em canais com
  // templates oficiais — a interface do conector Baileys NÃO expõe esse
  // caminho (restrição estrutural, regra inviolável 12).
  templateProativo?: { nome: string; variaveis: Record<string, string> };
}

export interface CapacidadesCanal {
  botoes: boolean; // reply buttons nativos
  listas: boolean; // list messages nativas
  templates: boolean; // templates proativos (fora de janela de sessão)
  midia: TipoMidia[];
  typing: boolean;
}

export interface Conector {
  tipo: TipoCanal;
  capacidades: CapacidadesCanal;

  // Webhook bruto do provedor -> formato canônico. Valida com Zod; payload
  // inválido é rejeitado na borda, nunca chega aos motores.
  receber(webhookPayload: unknown): Promise<MensagemInboundNormalizada[]>;

  // Formato canônico -> API do provedor. Retorna o id externo para
  // idempotência, correlação de status e threading (respostaA).
  enviar(mensagem: MensagemOutbound): Promise<{ idExterno: string }>;
}
