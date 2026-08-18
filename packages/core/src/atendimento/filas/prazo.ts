// Prazo de primeira resposta (E1): quando a conversa que acabou de entrar passa
// a ser atraso, e como o painel pinta isso ANTES de virar atraso.
//
// O prazo é CALCULADO na entrada e gravado em `Conversa.prazoPrimeiraRespostaEm`
// (nunca derivado na leitura): mudar o prazo da fila não pode reescrever o
// compromisso das conversas que já estavam em andamento.

import { z } from "zod";

import { avancarNoExpediente } from "./horario";
import type { FilaParaRoteamento } from "./roteamento";

export const situacaoPrazoSchema = z.enum([
  "sem_prazo",
  "no_prazo",
  "perto_do_estouro",
  "estourado",
  "cumprido",
]);
export type SituacaoPrazo = z.infer<typeof situacaoPrazoSchema>;

/** Fração do prazo que precisa ter corrido para o painel acender o alerta. */
export const FRACAO_DE_ALERTA = 0.8;

/**
 * Janela de alerta usada quando o chamador não informa o tamanho do prazo. Sem o
 * total não dá para saber quanto dele já correu; 5 min é o alerta conservador
 * para quem chama com a assinatura de três argumentos.
 */
export const MINUTOS_DE_ALERTA_SEM_TOTAL = 5;

/**
 * Prazo de primeira resposta a partir da entrada da conversa. `null` quando a
 * fila não promete prazo — e é `null` mesmo, não "prazo infinito": conversa sem
 * compromisso não pode competir por atenção no painel com quem tem.
 *
 * O relógio só corre com a fila ABERTA (ver `avancarNoExpediente`): mensagem das
 * 22h numa fila que abre às 8h tem prazo contado a partir das 8h.
 */
export function calcularPrazoPrimeiraResposta(
  entradaEm: Date,
  fila: FilaParaRoteamento,
): Date | null {
  const minutos = fila.prazoPrimeiraRespostaMin;
  if (minutos === null || !Number.isFinite(minutos) || minutos <= 0) return null;
  return avancarNoExpediente(entradaEm, minutos, fila.horarioJson);
}

/**
 * Como o painel deve pintar a conversa.
 *
 * `prazoTotalMin` é opcional e é o `prazoPrimeiraRespostaMin` da fila. Com ele o
 * alerta acende quando 80% do prazo já correu; sem ele, nos últimos
 * `MINUTOS_DE_ALERTA_SEM_TOTAL`. A conta é feita sobre o que FALTA para o prazo
 * absoluto, e não sobre o tempo corrido desde a entrada, justamente porque o
 * prazo pode ter atravessado uma noite inteira de fila fechada — medir "80% do
 * corrido" acenderia o alerta às 5h da manhã de uma conversa que ainda tem meia
 * hora de expediente pela frente.
 *
 * Conversa já respondida é `cumprido` mesmo que tenha sido respondida atrasada:
 * quem mede atraso é o relatório; o alerta serve para quem ainda pode agir.
 */
export function situacaoDoPrazo(
  agora: Date,
  prazo: Date | null | undefined,
  primeiraRespostaEm: Date | null | undefined,
  prazoTotalMin?: number | null | undefined,
): SituacaoPrazo {
  if (primeiraRespostaEm !== null && primeiraRespostaEm !== undefined) return "cumprido";
  if (prazo === null || prazo === undefined) return "sem_prazo";

  const restanteMs = prazo.getTime() - agora.getTime();
  if (restanteMs <= 0) return "estourado";

  // Arredondado porque 1 - 0.8 não é 0.2 em binário: sem isso, o prazo de 30 min
  // acenderia o alerta 1 ms depois dos 80%, e o teste de fronteira passaria a
  // depender do resto de ponto flutuante em vez da regra.
  const alertaMs =
    prazoTotalMin !== null && prazoTotalMin !== undefined && prazoTotalMin > 0
      ? Math.round(prazoTotalMin * 60_000 * (1 - FRACAO_DE_ALERTA))
      : MINUTOS_DE_ALERTA_SEM_TOTAL * 60_000;

  return restanteMs <= alertaMs ? "perto_do_estouro" : "no_prazo";
}
