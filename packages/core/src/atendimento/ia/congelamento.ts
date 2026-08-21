/**
 * PUBLICAR É CONGELAR — a regra que decide qual versão do agente atende um turno.
 *
 * O schema já anunciava isto no comentário do `AgenteIA` ("conversa em andamento
 * termina na versão em que começou"), e o `VersaoFluxo` já fazia o mesmo pela
 * árvore. Só que, para a IA, o contexto do turno resolvia a versão ativa do
 * agente **a cada turno**: publicar uma persona nova trocava o interlocutor no
 * meio da conversa, que é exatamente o que a regra existia para impedir.
 *
 * A decisão é pura de propósito. O que fala com o banco é quem chama.
 */

/** O que precisamos saber de uma versão para decidir se ela ainda serve. */
export interface VersaoParaCongelar {
  readonly id: string;
  readonly agenteId: string;
  readonly status: string;
}

export type MotivoDaVersao =
  /** Primeiro turno da conversa: a versão ativa do agente é congelada agora. */
  | "congelada-agora"
  /** Turno seguinte: a conversa continua com a versão em que começou. */
  | "mantida"
  /** A versão congelada sumiu do banco — conversa não pode morrer por isso. */
  | "recongelada-versao-ausente"
  /** A versão congelada foi despublicada, provavelmente porque estava ruim. */
  | "recongelada-versao-despublicada"
  /** O canal passou a apontar para outro agente. */
  | "recongelada-outro-agente";

export interface DecisaoDaVersao {
  /** A versão que atende este turno. */
  readonly versaoId: string;
  /** Precisa gravar o congelamento na conversa? */
  readonly gravar: boolean;
  readonly motivo: MotivoDaVersao;
}

/**
 * Qual versão atende agora.
 *
 * `congelada` é o que está na conversa; `ativa` é a versão publicada do agente
 * hoje. Quando as duas discordam, a **congelada vence** — é esse o ponto.
 *
 * As três exceções recongelam, e cada uma tem um motivo diferente de existir:
 *
 * - **Sumiu do banco.** Sem versão não há turno, e deixar a conversa morrer para
 *   defender a continuidade da persona seria trocar um problema visível por um
 *   pior.
 * - **Foi despublicada.** Despublicar é ato deliberado, e a razão mais comum é a
 *   versão estar se comportando mal. Continuar usando uma versão que o dono
 *   acabou de tirar do ar contraria a intenção dele.
 * - **É de outro agente.** O canal foi reapontado; a versão antiga responde por
 *   um agente que não atende mais este canal.
 */
export function versaoQueAtende(
  congelada: VersaoParaCongelar | null | undefined,
  ativa: VersaoParaCongelar,
): DecisaoDaVersao {
  if (!congelada) {
    return { versaoId: ativa.id, gravar: true, motivo: "congelada-agora" };
  }
  if (congelada.agenteId !== ativa.agenteId) {
    return { versaoId: ativa.id, gravar: true, motivo: "recongelada-outro-agente" };
  }
  if (congelada.status !== "publicada") {
    return { versaoId: ativa.id, gravar: true, motivo: "recongelada-versao-despublicada" };
  }
  return { versaoId: congelada.id, gravar: false, motivo: "mantida" };
}

/**
 * O caso em que a conversa aponta para uma versão que não existe mais.
 *
 * Fica separado porque quem chama não tem uma `VersaoParaCongelar` para
 * entregar — ele tem um id que não achou linha nenhuma.
 */
export function versaoAusente(ativa: VersaoParaCongelar): DecisaoDaVersao {
  return { versaoId: ativa.id, gravar: true, motivo: "recongelada-versao-ausente" };
}
