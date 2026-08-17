// Degradacao por capacidade — o espelho, no eixo das integracoes, da regra que
// `packages/canais/src/degradacao.ts` aplica aos canais:
//
//   O CONECTOR DEGRADA. O MOTOR NUNCA SE ADAPTA.
//
// O motor pergunta "da para cobrar?" e recebe uma resposta honesta. Ele nao
// pergunta "qual ERP e esse?" — no dia em que perguntasse, cada ERP novo
// exigiria um `if` no meio da regra de negocio, e a regra viraria uma arvore de
// excecoes que ninguem consegue mais ler.

import type { CapacidadesErp, ConectorERP } from "./tipos";

export type FormaDeCobranca = "pix" | "link" | "nenhuma";

/**
 * Como este ERP consegue cobrar.
 *
 * O Pix vem primeiro por ser o que fecha a venda dentro da conversa: o cliente
 * copia e cola sem sair do chat. Link exige abrir navegador, o que perde gente
 * no meio do caminho.
 */
export function formaDeCobranca(cap: CapacidadesErp): FormaDeCobranca {
  if (cap.cobrancaPix) return "pix";
  if (cap.linkPagamento) return "link";
  return "nenhuma";
}

export interface FerramentaHabilitada {
  readonly nome: string;
  readonly motivoSeDesabilitada?: string;
}

/**
 * Quais tools de ERP fazem sentido oferecer ao agente deste tenant.
 *
 * Oferecer uma ferramenta que o ERP não suporta é pior do que não ter
 * integração nenhuma: o modelo tenta usar, recebe erro, e ou inventa uma
 * desculpa ou repete a tentativa. Filtrar aqui é o que mantém o catálogo de
 * ferramentas honesto — e o motivo escrito é o que a tela de integrações mostra
 * quando alguém pergunta por que a opção sumiu.
 */
export function ferramentasDoErp(cap: CapacidadesErp): FerramentaHabilitada[] {
  const lista: FerramentaHabilitada[] = [];

  lista.push({
    nome: "erpBuscarProdutos",
    ...(cap.produtos ? {} : { motivoSeDesabilitada: "Este ERP não expõe catálogo de produtos." }),
  });
  lista.push({
    nome: "erpCriarPedido",
    ...(cap.pedidos ? {} : { motivoSeDesabilitada: "Este ERP não aceita criação de pedidos pela API." }),
  });
  lista.push({
    nome: "erpGerarPix",
    ...(cap.cobrancaPix
      ? {}
      : {
          motivoSeDesabilitada: cap.linkPagamento
            ? "Este ERP não emite Pix — a cobrança sai como link de pagamento."
            : "Este ERP não emite cobrança.",
        }),
  });
  lista.push({
    nome: "erpStatusCobranca",
    ...(cap.cobrancaPix || cap.linkPagamento
      ? {}
      : { motivoSeDesabilitada: "Este ERP não emite cobrança." }),
  });

  return lista;
}

/** Só os nomes que o agente realmente recebe. */
export function nomesHabilitados(cap: CapacidadesErp): string[] {
  return ferramentasDoErp(cap)
    .filter((f) => !f.motivoSeDesabilitada)
    .map((f) => f.nome);
}

/**
 * A baixa de pagamento precisa de varredura ativa?
 *
 * ERP sem webhook não avisa que foi pago: alguém tem de perguntar. Saber disso
 * aqui é o que permite o worker agendar a consulta só para os tenants que
 * precisam — varrer todo mundo "por garantia" gastaria chamada de API à toa nos
 * ERPs que avisam sozinhos.
 */
export function precisaVarrerCobrancas(cap: CapacidadesErp): boolean {
  const cobra = cap.cobrancaPix || cap.linkPagamento;
  return cobra && !cap.baixaWebhook;
}

/**
 * Guarda de chamada: o motor não deve pedir o que o conector não faz.
 *
 * Levanta erro alto em vez de devolver vazio — vazio seria interpretado como
 * "não há produtos", e o agente diria ao cliente que o catálogo está vazio
 * quando na verdade ninguém perguntou ao ERP.
 */
export function exigirCapacidade(
  conector: ConectorERP,
  capacidade: keyof CapacidadesErp,
): void {
  if (!conector.capacidades[capacidade]) {
    throw new Error(
      `A integração ${conector.tipo} não suporta "${capacidade}" — a ferramenta não deveria ter sido oferecida ao agente.`,
    );
  }
}
