// Decisoes sobre falha do provedor de IA. Puras, sem SDK e sem rede.
// Port de `ev-tracker/src/lib/esteira/tentativa-ia.ts`.
//
// A motivacao original vale igual aqui: sem `try/catch` em volta da chamada ao
// modelo, um 429, um 401 ou um timeout viram uma linha de log e o cliente NAO
// recebe nada. Silencio e a pior resposta possivel num canal onde a pessoa fica
// olhando o "digitando…" sumir.

export type Provedor = "anthropic" | "gemini" | "openai" | "grok";

/** Ordem de preferencia quando e preciso escolher um substituto. */
export const PREFERENCIA: readonly Provedor[] = ["anthropic", "gemini", "openai", "grok"];

/**
 * Provedores que a PLATAFORMA autoriza a receber conteudo de conversa.
 *
 * Diferenca importante em relacao ao ev-tracker, onde esta lista era uma
 * constante fechada da politica da Sankhya: aqui o Mensvra Channel é operador de
 * varios controladores, e cada tenant pode trazer a propria chave. A lista
 * continua no CODIGO — nao em tabela editavel pelo painel — porque homologar um
 * provedor é decisao de quem responde pelo DPA, e um clique de ADMIN de tenant
 * nao pode desfazer isso.
 *
 * ⚠️ Nunca acrescentar provedor em FREE TIER: os termos do nivel gratuito
 * costumam autorizar uso do conteudo para melhoria do produto e preveem revisao
 * humana. Foi exatamente por isso que o Gemini ficou fora da lista no
 * ev-tracker, depois de descobrirem que ele era o primeiro substituto escolhido.
 */
export const PROVEDORES_HOMOLOGADOS: readonly Provedor[] = ["anthropic"];

/**
 * Filtra os candidatos a reserva pela homologacao.
 *
 * Com o interruptor desligado devolve a lista inteira — de proposito, para que
 * ligar a restricao seja uma decisao explicita e datada, e nao efeito colateral
 * de deploy.
 */
export function filtrarReservasHomologadas(
  provedores: readonly Provedor[],
  somenteHomologados: boolean,
): Provedor[] {
  if (!somenteHomologados) return [...provedores];
  return provedores.filter((p) => PROVEDORES_HOMOLOGADOS.includes(p));
}

/**
 * Quanto tempo o turno inteiro pode gastar com o modelo.
 *
 * Existe porque sem teto agregado o laco de tool use vai a 8 iteracoes de 45 s
 * cada — aritmetica que nunca fecha contra o tempo de vida do job, e quando
 * estoura a execucao morre sem resposta e sem erro.
 */
export const ORCAMENTO_IA_MS = 40_000;

/** Abaixo disto nao vale comecar outra tentativa: ela nao terminaria a tempo. */
export const MINIMO_PARA_RESERVA_MS = 12_000;

/** Teto de iteracoes de tool use num turno. */
export const MAX_ITERACOES = 8;

export type ClasseErro = "timeout" | "limite" | "credencial" | "requisicao" | "desconhecido";

/** Classifica so para o LOG — a decisao de tentar a reserva nao depende disto. */
export function classificarErroIA(e: unknown): ClasseErro {
  const status = (e as { status?: number } | null)?.status;
  if (status === 429) return "limite";
  if (status === 401 || status === 403) return "credencial";
  if (status === 400 || status === 422) return "requisicao";
  if (typeof status === "number" && status >= 500) return "desconhecido";

  const msg = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  if (/timeout|tempo esgotado|etimedout|aborted/.test(msg)) return "timeout";
  if (/rate.?limit|quota|overloaded/.test(msg)) return "limite";
  if (/api.?key|unauthorized|permission/.test(msg)) return "credencial";
  return "desconhecido";
}

/**
 * Vale tentar OUTRO provedor?
 *
 * Sim para qualquer erro, desde que sobre tempo — e isso nao e preguica de
 * classificar: o substituto e outro servico, com outra chave e outro formato de
 * requisicao. Ate 401 (chave errada) e 400 (schema que aquele provedor recusa —
 * ja aconteceu com ferramenta de objeto vazio no Gemini) tem chance real de
 * funcionar do outro lado. O custo e uma chamada a mais so no caminho de falha.
 */
export function deveTentarReserva(p: {
  readonly reserva: Provedor | null;
  readonly msRestantes: number;
}): boolean {
  return p.reserva !== null && p.msRestantes >= MINIMO_PARA_RESERVA_MS;
}

/** Primeiro provedor configurado que nao seja o ativo. */
export function escolherReserva(
  ativo: Provedor,
  configurados: readonly Provedor[],
): Provedor | null {
  return PREFERENCIA.find((p) => p !== ativo && configurados.includes(p)) ?? null;
}

/**
 * Mensagem quando nenhum provedor respondeu.
 *
 * Diz o que aconteceu e o que acontece a seguir — nunca finge que a pergunta
 * nao existiu, e nunca inventa uma resposta. O encaminhamento para humano nao e
 * gentileza: e o unico desfecho honesto quando a maquina nao consegue atender.
 */
export function textoFalhaIA(): string {
  return (
    "Tive um problema para responder agora. 😕\n\n" +
    "Já avisei a equipe — alguém continua esta conversa com você em instantes."
  );
}
