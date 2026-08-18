import { describe, expect, it } from "vitest";

import {
  ILIMITADO,
  type LimitesDoPlano,
  decidirTeto,
  excedenteDoMesCentavos,
  podeCriar,
} from "./limites";

// Plano de referência: o Basic do doc 06 — franquia de conversas de IA e
// excedente de R$ 0,49 por conversa adicional.
const BASIC: LimitesDoPlano = {
  limiteUsuarios: 3,
  limiteCanais: 2,
  limiteConversasIaMes: 200,
  excedenteIaCentavos: 49,
};

const PREMIUM: LimitesDoPlano = {
  limiteUsuarios: ILIMITADO,
  limiteCanais: ILIMITADO,
  limiteConversasIaMes: ILIMITADO,
  excedenteIaCentavos: 49,
};

const SEM_IA: LimitesDoPlano = { ...BASIC, limiteConversasIaMes: 0 };

const uso = (conversasIa: number) => ({ conversasIa, custoIaCentavos: 0 });

describe("decidirTeto", () => {
  it("libera o turno enquanto sobra franquia, e diz quanto sobra", () => {
    const d = decidirTeto(uso(10), BASIC);
    expect(d.permite).toBe(true);
    if (!d.permite) return;
    expect(d.restante).toBe(190);
    expect(d.avisar).toBe(false);
  });

  /**
   * O aviso a 80% é o que o doc 06 vende como anti-surpresa: é a diferença
   * entre o cliente decidir se quer o excedente e o cliente descobri-lo na
   * fatura. A borda é testada dos dois lados porque um `>` no lugar de `>=`
   * atrasaria o aviso em uma conversa inteira e ninguém notaria.
   */
  it("avisa a partir de exatamente 80% da franquia", () => {
    const antes = decidirTeto(uso(159), BASIC);
    const dentro = decidirTeto(uso(160), BASIC);
    expect(antes.permite && antes.avisar).toBe(false);
    expect(dentro.permite && dentro.avisar).toBe(true);
  });

  /**
   * Fail-closed, mas NÃO silencioso. Estourado o teto, o que para é a IA — o
   * atendimento continua pelo fluxo determinístico e pela fila humana. O texto
   * precisa dizer isso: quem lê a recusa (operador ou tela do painel) tem que
   * entender que ninguém ficou sem resposta, senão a reação é desligar o teto.
   */
  it("recusa o turno no limite e explica que o atendimento continua", () => {
    const d = decidirTeto(uso(200), BASIC);
    expect(d.permite).toBe(false);
    if (d.permite) return;
    expect(d.motivo).toContain("200");
    expect(d.motivo).toMatch(/fila humana/i);
  });

  it("continua recusando acima do limite, sem restante negativo", () => {
    expect(decidirTeto(uso(10_000), BASIC).permite).toBe(false);
  });

  /**
   * Ilimitado devolve `Infinity` de propósito: qualquer barra de progresso ou
   * subtração no painel continua valendo, sem um número mágico grande que um
   * dia alguém atinge.
   */
  it("no plano ilimitado nunca recusa nem avisa", () => {
    const d = decidirTeto(uso(1_000_000), PREMIUM);
    expect(d.permite).toBe(true);
    if (!d.permite) return;
    expect(d.avisar).toBe(false);
    expect(d.restante).toBe(Number.POSITIVE_INFINITY);
  });

  /** Limite zero é "o plano não tem IA", não "acabou a franquia". */
  it("limite zero recusa desde a primeira conversa", () => {
    const d = decidirTeto(uso(0), SEM_IA);
    expect(d.permite).toBe(false);
    if (d.permite) return;
    expect(d.motivo).toMatch(/não inclui/i);
  });
});

describe("excedenteDoMesCentavos", () => {
  it("cobra só as conversas acima da franquia", () => {
    // 250 conversas em franquia de 200 = 50 excedentes × R$ 0,49.
    expect(excedenteDoMesCentavos(uso(250), BASIC)).toBe(2450);
  });

  /**
   * As conversas de dentro da franquia já foram pagas na mensalidade. Cobrar as
   * 200 primeiras de novo seria cobrar duas vezes pela mesma conversa — o erro
   * que só aparece depois de a fatura ter saído.
   */
  it("não cobra nada enquanto a franquia não estoura", () => {
    expect(excedenteDoMesCentavos(uso(200), BASIC)).toBe(0);
    expect(excedenteDoMesCentavos(uso(0), BASIC)).toBe(0);
  });

  it("plano ilimitado nunca gera excedente", () => {
    expect(excedenteDoMesCentavos(uso(50_000), PREMIUM)).toBe(0);
  });

  /**
   * Plano vendido SEM IA não tem preço de excedente. Se consumo apareceu ali, o
   * teto vazou — e transformar um bug nosso em linha de fatura do cliente é o
   * pior desfecho possível. O consumo continua visível no painel, que é onde
   * ele deve ser resolvido.
   */
  it("plano sem IA não vira fatura mesmo com consumo registrado", () => {
    expect(excedenteDoMesCentavos(uso(37), SEM_IA)).toBe(0);
  });
});

describe("podeCriar", () => {
  it("libera enquanto cabe", () => {
    expect(podeCriar("usuarios", 2, BASIC)).toEqual({ permite: true });
    expect(podeCriar("canais", 0, BASIC)).toEqual({ permite: true });
  });

  /**
   * O motivo é a tela, não o log. Quem bate no teto é cliente pagante querendo
   * usar MAIS o produto: a resposta precisa dizer o limite, o uso atual e a
   * saída. É por isso que este módulo devolve motivo em vez de deixar o insert
   * quebrar numa constraint e virar "algo deu errado".
   */
  it("recusa no limite com mensagem de upsell em português", () => {
    const r = podeCriar("usuarios", 3, BASIC);
    expect(r.permite).toBe(false);
    expect(r.motivo).toContain("3 usuários");
    expect(r.motivo).toContain("já usa 3");
    expect(r.motivo).toMatch(/upgrade/i);
  });

  it("concorda o singular quando o plano permite um só", () => {
    const r = podeCriar("canais", 1, { ...BASIC, limiteCanais: 1 });
    expect(r.motivo).toContain("1 canal");
    expect(r.motivo).not.toContain("1 canais");
  });

  it("limite zero é recurso fora do plano, não teto atingido", () => {
    const r = podeCriar("canais", 0, { ...BASIC, limiteCanais: 0 });
    expect(r.permite).toBe(false);
    expect(r.motivo).toMatch(/não inclui canais/i);
  });

  it("ilimitado nunca recusa e não devolve motivo", () => {
    expect(podeCriar("usuarios", 9_999, PREMIUM)).toEqual({ permite: true });
  });
});
