// Propose-confirm: as decisoes, puras. A regra inviolavel 10 em codigo.
//
// NENHUMA escrita disparada por IA acontece direto. A tool cria uma proposta
// PENDENTE, o cliente confirma pelo canal, e a execucao e deterministica — sem
// LLM no caminho. Este arquivo decide QUANDO uma confirmacao vale; quem grava
// e o worker.

export type StatusProposta = "PENDENTE" | "CONFIRMADA" | "EXPIRADA" | "REJEITADA";

export type TipoProposta = "montar_pedido" | "gerar_cobranca" | "enviar_contrato";

/** TTL da proposta. Ver `motivoDoTtl` abaixo. */
export const TTL_PROPOSTA_MS = 15 * 60_000;

/**
 * Por que a proposta expira em 15 minutos.
 *
 * Um "sim" tardio — o cliente que volta duas horas depois e responde à última
 * mensagem sem reler — executaria algo que ele já esqueceu que pediu. No fluxo
 * de venda isso é cobrar um pedido que a pessoa não quer mais. Quinze minutos é
 * a janela em que a conversa ainda é a mesma conversa.
 */
export const motivoDoTtl =
  "Proposta expira em 15 min: um 'sim' tardio executaria algo que o cliente já esqueceu que pediu.";

export interface PropostaParaDecidir {
  readonly status: StatusProposta;
  readonly expiraEm: Date;
  /** Identidade que ORIGINOU a proposta. */
  readonly identidadeCanalId: string;
}

export type MotivoRecusa =
  | "nao-esta-pendente"
  | "expirada"
  | "outra-identidade";

export type VeredictoConfirmacao =
  | { readonly pode: true }
  | { readonly pode: false; readonly motivo: MotivoRecusa; readonly texto: string };

/**
 * Esta confirmação vale?
 *
 * Três perguntas, nesta ordem — e a ordem importa para a mensagem que o cliente
 * recebe: dizer "expirou" para uma proposta já confirmada seria mentira, e
 * mandaria a pessoa refazer algo que já aconteceu.
 *
 * A checagem de identidade é a que não pode faltar: **só quem originou
 * confirma**. Sem ela, um "sim" vindo de outro canal do mesmo cliente — ou de
 * outra pessoa no mesmo número compartilhado — executaria uma proposta que essa
 * identidade nunca viu.
 */
export function podeConfirmar(
  proposta: PropostaParaDecidir,
  quemConfirma: { readonly identidadeCanalId: string },
  agora: Date,
): VeredictoConfirmacao {
  if (proposta.status !== "PENDENTE") {
    return {
      pode: false,
      motivo: "nao-esta-pendente",
      texto:
        proposta.status === "CONFIRMADA"
          ? "Isso já está confirmado. 👍"
          : "Essa solicitação não está mais aberta. Quer que eu comece de novo?",
    };
  }

  if (proposta.identidadeCanalId !== quemConfirma.identidadeCanalId) {
    return {
      pode: false,
      motivo: "outra-identidade",
      texto: "Não encontrei nada pendente para confirmar por aqui.",
    };
  }

  if (agora >= proposta.expiraEm) {
    return {
      pode: false,
      motivo: "expirada",
      texto: "Essa confirmação expirou. Se ainda quiser, eu preparo de novo — é rápido.",
    };
  }

  return { pode: true };
}

export type LeituraDaResposta = "confirma" | "recusa" | "indefinida";

/**
 * Interpretação ESTRITA da resposta do cliente.
 *
 * Deliberadamente burra, e é isso que a torna segura: o que está em jogo é
 * executar uma escrita. Frase ambígua ("acho que sim", "pode ser", "sim, mas
 * troca o horário") volta `indefinida`, e o motor pergunta de novo em vez de
 * adivinhar. Errar para "não entendi" custa uma pergunta; errar para "confirma"
 * custa um pedido que ninguém quis.
 *
 * Interpretação por LLM entra como SEGUNDA tentativa, quando esta devolver
 * `indefinida` — nunca no lugar dela.
 */
const CONFIRMA = /^(s|sim|isso|ok|okay|confirmo|confirmar|pode|pode ser|claro|isso mesmo|✅|👍)$/i;
const RECUSA = /^(n|nao|não|negativo|cancela|cancelar|deixa|deixa pra la|deixa pra lá|❌|👎)$/i;

export function lerResposta(texto: string): LeituraDaResposta {
  // Pontuação e espaço não mudam a intenção; o resto do texto, sim.
  const limpo = texto
    .trim()
    .toLowerCase()
    .replace(/[.!…]+$/u, "")
    .trim();

  if (CONFIRMA.test(limpo)) return "confirma";
  if (RECUSA.test(limpo)) return "recusa";
  return "indefinida";
}

/**
 * Uma proposta nova cancela a anterior da mesma conversa.
 *
 * O banco garante isso por índice parcial (`uma_pendente_por_conversa`), mas a
 * regra precisa existir aqui também: quem cria a proposta tem de REJEITAR a
 * anterior no mesmo passo, senão o insert falha por violação de unicidade e a
 * conversa trava — o cliente pede outra coisa e o agente responde com erro.
 */
export const REGRA_UMA_PENDENTE =
  "Antes de criar proposta, rejeitar a PENDENTE anterior da mesma conversa (índice parcial garante).";

export function expiraEmA_partirDe(agora: Date): Date {
  return new Date(agora.getTime() + TTL_PROPOSTA_MS);
}
