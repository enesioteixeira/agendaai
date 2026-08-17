// Formatos canonicos das integracoes de retaguarda (ERP e CRM).
//
// Sao schemas Zod, e nao interfaces soltas, pela regra 14: tudo que atravessa
// fronteira valida na borda. O payload de um ERP de terceiro e entrada NAO
// CONFIAVEL tanto quanto um webhook de canal — campo faltando, numero como
// string, data em formato proprio e o normal, nao a excecao.
//
// ⚠️ Zod v4 pelo subpath (doc 11): codigo novo importa de "zod/v4".

import { z } from "zod/v4";

/**
 * Dinheiro atravessa a fronteira em CENTAVOS INTEIROS (regra 16).
 *
 * Os ERPs mandam de tudo — "1234.56", 1234.56, "1.234,56" — e cada driver e
 * responsavel por converter ANTES de entregar ao formato canonico. Aceitar
 * float aqui seria espalhar erro de arredondamento por todo o sistema a partir
 * de um unico driver desleixado.
 */
export const centavos = z.number().int();

export const produtoErpSchema = z.object({
  idExterno: z.string().min(1),
  codigo: z.string().optional(),
  nome: z.string().min(1),
  descricao: z.string().optional(),
  precoCentavos: centavos,
  unidade: z.string().optional(),
  /** `null` quando o ERP nao controla estoque do item — diferente de zero. */
  estoque: z.number().nullable().optional(),
  ativo: z.boolean().default(true),
});
export type ProdutoErp = z.infer<typeof produtoErpSchema>;

export const servicoErpSchema = z.object({
  idExterno: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string().optional(),
  precoCentavos: centavos,
  ativo: z.boolean().default(true),
});
export type ServicoErp = z.infer<typeof servicoErpSchema>;

export const clienteErpSchema = z.object({
  idExterno: z.string().min(1),
  nome: z.string().min(1),
  documento: z.string().optional(),
  email: z.string().optional(),
  telefone: z.string().optional(),
});
export type ClienteErp = z.infer<typeof clienteErpSchema>;

export const itemDePedidoSchema = z.object({
  idExternoProduto: z.string().min(1),
  quantidade: z.number().positive(),
  precoUnitarioCentavos: centavos,
});

export const pedidoParaErpSchema = z.object({
  idLocal: z.string().min(1),
  idExternoCliente: z.string().min(1),
  itens: z.array(itemDePedidoSchema).min(1),
  observacao: z.string().optional(),
});
export type PedidoParaErp = z.infer<typeof pedidoParaErpSchema>;

export const cobrancaParaErpSchema = z.object({
  idLocal: z.string().min(1),
  idExternoCliente: z.string().min(1),
  idExternoPedido: z.string().optional(),
  valorCentavos: centavos,
  vencimento: z.date(),
  descricao: z.string().optional(),
});
export type CobrancaParaErp = z.infer<typeof cobrancaParaErpSchema>;

/**
 * O retorno da cobranca traz Pix e/ou link — e nunca os dois obrigatorios.
 *
 * Nem todo ERP emite Pix, e nem todo emite link de pagamento. Exigir os dois
 * faria o driver inventar um dos campos para satisfazer o schema, que e
 * exatamente o tipo de mentira que a validacao existe para impedir. O motor
 * pergunta o que veio e degrada (ver `degradacao.ts`).
 */
export const cobrancaEmitidaSchema = z
  .object({
    idExterno: z.string().min(1),
    pixCopiaECola: z.string().optional(),
    linkPagamento: z.string().optional(),
    vencimento: z.date(),
  })
  .refine((c) => Boolean(c.pixCopiaECola ?? c.linkPagamento), {
    message: "A cobrança precisa trazer ao menos Pix copia-e-cola ou link de pagamento.",
  });
export type CobrancaEmitida = z.infer<typeof cobrancaEmitidaSchema>;

export const statusCobrancaSchema = z.enum([
  "aberta",
  "paga",
  "cancelada",
  "vencida",
  "estornada",
]);
export type StatusCobrancaErp = z.infer<typeof statusCobrancaSchema>;

/**
 * Evento normalizado vindo de webhook do ERP.
 *
 * `ocorridoEm` e do EVENTO, nao do recebimento: webhook reentregue horas depois
 * precisa ser ordenavel pelo instante real, senao uma baixa antiga sobrescreve
 * um cancelamento novo.
 */
export const eventoErpSchema = z.object({
  tipo: z.enum([
    "cobranca.paga",
    "cobranca.cancelada",
    "pedido.faturado",
    "contrato.ativado",
  ]),
  idExterno: z.string().min(1),
  ocorridoEm: z.date(),
  valorCentavos: centavos.optional(),
  dados: z.record(z.string(), z.unknown()).optional(),
});
export type EventoErpNormalizado = z.infer<typeof eventoErpSchema>;

// ── CRM ──────────────────────────────────────────────────────────────────

export const contatoCrmSchema = z.object({
  idExterno: z.string().min(1),
  nome: z.string().min(1),
  email: z.string().optional(),
  telefone: z.string().optional(),
  empresa: z.string().optional(),
});
export type ContatoCrm = z.infer<typeof contatoCrmSchema>;

export const oportunidadeCrmSchema = z.object({
  idExterno: z.string().min(1),
  titulo: z.string().min(1),
  idExternoContato: z.string().min(1),
  valorCentavos: centavos.optional(),
  etapa: z.string().optional(),
});
export type OportunidadeCrm = z.infer<typeof oportunidadeCrmSchema>;
