/**
 * FILAS DE ATENDIMENTO (E1) — quem recebe a conversa e até quando.
 *
 * Duas decisões vivem aqui, e as duas são puras: a de ROTEAMENTO (`roteamento.ts`)
 * e a de PRAZO (`prazo.ts`), esta última em cima do EXPEDIENTE (`horario.ts`).
 * Nenhuma delas consulta banco, sorteia ou lê o relógio: o instante entra por
 * parâmetro. É o que permite reproduzir no teste a conversa que entrou às 22h de
 * um sábado sem esperar sábado.
 *
 * O que NÃO mora aqui, e por quê:
 * - **Contar conversa aberta, ler o último atendente da fila e gravar o prazo** —
 *   é I/O; o app busca e passa (`MembroParaRoteamento.conversasAbertas`,
 *   `ContextoDeRoteamento.ultimoAtendenteId`).
 * - **Enviar a `mensagemForaHorario`** — a decisão de "está fora do expediente"
 *   sai de `dentroDoExpediente`; enviar é do conector.
 * - **Escalonamento e reatribuição por estouro** — dependem de agendamento
 *   (pg-boss), não de decisão. `situacaoDoPrazo` é o que eles vão consultar.
 */

export {
  FUSO_PADRAO,
  avancarNoExpediente,
  dentroDoExpediente,
  horarioFilaSchema,
  intervaloExpedienteSchema,
  lerExpediente,
  proximaAberturaDoExpediente,
  type Expediente,
  type FaixaDoDia,
  type HorarioFila,
  type IntervaloExpediente,
} from "./horario";

export {
  distribuicaoSchema,
  escolherAtendente,
  type ContextoDeRoteamento,
  type Distribuicao,
  type FilaParaRoteamento,
  type MembroParaRoteamento,
} from "./roteamento";

export {
  FRACAO_DE_ALERTA,
  MINUTOS_DE_ALERTA_SEM_TOTAL,
  calcularPrazoPrimeiraResposta,
  situacaoDoPrazo,
  situacaoPrazoSchema,
  type SituacaoPrazo,
} from "./prazo";
