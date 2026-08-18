// Teto por plano e checagem de limite. Decisões puras: recebem o uso já apurado
// e devolvem o veredicto — quem lê o banco é o app.
//
// O que este arquivo protege: até existir medição, "teto de custo de IA por
// plano" era promessa de tela. As três decisões que faltavam são o teto do
// turno de IA (`decidirTeto`), o quanto disso vira fatura (`excedenteDoMesCentavos`)
// e o limite de recurso do painel (`podeCriar`).

/**
 * Convenção dos limites, valendo para os quatro campos do `PlanoLicenca`:
 *
 * - **positivo** — o teto propriamente dito;
 * - **zero** — recurso NÃO faz parte do plano (não é "nenhum ainda", é "não tem");
 * - **negativo** — ilimitado (é como o Premium do doc 06 é vendido).
 *
 * Zero e negativo são estados distintos de propósito: sem essa distinção,
 * "ilimitado" precisaria ser um número grande escolhido no chute, e um dia
 * alguém o atingiria.
 */
export const ILIMITADO = -1;

export function ehIlimitado(limite: number): boolean {
  return limite < 0;
}

export interface LimitesDoPlano {
  readonly limiteUsuarios: number;
  readonly limiteCanais: number;
  readonly limiteConversasIaMes: number;
  readonly excedenteIaCentavos: number;
}

export interface UsoDoMes {
  readonly conversasIa: number;
  readonly custoIaCentavos: number;
}

export type DecisaoDeTeto =
  | { readonly permite: true; readonly avisar: boolean; readonly restante: number }
  | { readonly permite: false; readonly motivo: string };

/**
 * Fração da franquia a partir da qual o tenant é avisado.
 *
 * 80% não é enfeite: o doc 06 vende "aviso automático a 80% da franquia" como
 * parte do pacote anti-surpresa. Sem o aviso, o cliente descobre o excedente na
 * fatura, que é o desfecho que o documento diz destruir conta.
 */
export const FRACAO_DE_AVISO = 0.8;

/**
 * O próximo turno de IA pode acontecer?
 *
 * Fail-closed, mas **não silencioso**: recusado o turno, o atendimento continua
 * — a conversa vai para a fila humana e para o fluxo determinístico. O que para
 * é o motor caro, nunca o atendimento (doc 06 §1, doc 12 §5.6). Por isso o
 * `motivo` é texto pronto para tela e diz o que acontece a seguir: quem lê a
 * recusa precisa entender que ninguém ficou sem resposta.
 *
 * `restante` é quanto ainda cabe no mês — `Infinity` no plano ilimitado, de
 * propósito, para que qualquer aritmética de barra de progresso continue
 * valendo sem um número mágico no meio.
 */
export function decidirTeto(uso: UsoDoMes, limites: LimitesDoPlano): DecisaoDeTeto {
  const limite = limites.limiteConversasIaMes;

  if (ehIlimitado(limite)) {
    return { permite: true, avisar: false, restante: Number.POSITIVE_INFINITY };
  }

  if (limite === 0) {
    return {
      permite: false,
      motivo:
        "Seu plano não inclui atendimento por IA. As conversas seguem pelo fluxo automático e pela fila humana.",
    };
  }

  const consumidas = Math.max(0, uso.conversasIa);

  if (consumidas >= limite) {
    return {
      permite: false,
      motivo: `Você atingiu o limite de ${limite} conversas com IA deste mês. O atendimento continua: as próximas conversas seguem pelo fluxo automático e vão para a fila humana.`,
    };
  }

  return {
    permite: true,
    // Comparação em inteiros para não depender de ponto flutuante: com
    // `consumidas / limite >= 0.8`, um plano de 5 conversas avisa ou não avisa
    // na quarta dependendo do arredondamento binário.
    avisar: consumidas * 5 >= limite * 4,
    restante: limite - consumidas,
  };
}

/**
 * Quanto do mês vira excedente, em centavos.
 *
 * Conta só as conversas ACIMA da franquia — as de dentro já foram pagas na
 * mensalidade, e cobrá-las de novo seria cobrar duas vezes pela mesma conversa.
 *
 * Plano sem IA (limite zero) devolve zero mesmo que apareça consumo: não existe
 * preço de excedente para um plano vendido sem IA, e transformar um vazamento
 * do teto em linha de fatura seria cobrar do cliente um bug nosso. O consumo
 * indevido continua visível no painel de consumo, que é onde ele deve ser
 * resolvido.
 */
export function excedenteDoMesCentavos(uso: UsoDoMes, limites: LimitesDoPlano): number {
  const limite = limites.limiteConversasIaMes;
  if (limite <= 0) return 0;

  const excedentes = Math.max(0, Math.floor(uso.conversasIa) - limite);
  return excedentes * Math.max(0, limites.excedenteIaCentavos);
}

/** Recursos do painel que o plano limita por contagem. */
export type RecursoLimitado = "usuarios" | "canais";

interface DescricaoDoRecurso {
  readonly limite: (l: LimitesDoPlano) => number;
  readonly singular: string;
  readonly plural: string;
}

const RECURSOS: Record<RecursoLimitado, DescricaoDoRecurso> = {
  usuarios: { limite: (l) => l.limiteUsuarios, singular: "usuário", plural: "usuários" },
  canais: { limite: (l) => l.limiteCanais, singular: "canal", plural: "canais" },
};

/**
 * Cabe mais um?
 *
 * Checagem de APLICAÇÃO, não constraint de banco. A resposta certa a "estourou o
 * limite" é uma mensagem que explica o que fazer — quem bate no teto do plano é
 * cliente pagante querendo usar mais o produto, e recebê-lo com erro 500 (ou com
 * violação de constraint traduzida em "algo deu errado") transforma o momento de
 * upsell em chamado de suporte. Por isso o `motivo` sai pronto para a tela, em
 * português, dizendo o limite, o uso atual e a saída.
 */
export function podeCriar(
  recurso: RecursoLimitado,
  atual: number,
  limites: LimitesDoPlano,
): { permite: boolean; motivo?: string } {
  const descricao = RECURSOS[recurso];
  const limite = descricao.limite(limites);

  if (ehIlimitado(limite)) return { permite: true };

  if (limite === 0) {
    return {
      permite: false,
      motivo: `Seu plano não inclui ${descricao.plural}. Faça upgrade para liberar.`,
    };
  }

  const usados = Math.max(0, Math.floor(atual));
  if (usados >= limite) {
    const rotulo = limite === 1 ? descricao.singular : descricao.plural;
    return {
      permite: false,
      motivo: `Seu plano permite ${limite} ${rotulo} e você já usa ${usados}. Faça upgrade do plano para adicionar mais.`,
    };
  }

  return { permite: true };
}
