/**
 * NUCLEO DO MOTOR DE IA — as decisoes, sem SDK e sem banco.
 *
 * O que mora aqui e a parte que pode errar de forma silenciosa: quando desistir
 * de um provedor, o que mascarar antes de o conteudo sair da plataforma, e como
 * separar "o modelo disse que fez" de "o sistema fez". Tudo puro e testado.
 *
 * O que NAO mora aqui, e por que:
 * - **Os adapters de provedor** (Anthropic, Gemini, OpenAI/Grok) — dependem dos
 *   SDKs e entram na proxima etapa da Fase C. O contrato que eles vao cumprir ja
 *   esta em `tipos.ts`.
 * - **Prompts e tools de dominio** — nascem com o `AgenteIA` por tenant (Fase D):
 *   a persona e as ferramentas habilitadas sao configuracao do cliente, nao
 *   constante de codigo.
 * - **Qualquer coisa que fale com o banco** — o motor recebe o que precisa por
 *   parametro. E o que permite testar o turno inteiro sem Postgres, e o que vai
 *   permitir trocar "chave da plataforma" por "chave do tenant" sem tocar aqui.
 */

export {
  cartaoValido,
  cnpjValido,
  cpfValido,
  luhnValido,
  aplicarPortaoPii,
  mascararPii,
  totalAchados,
  type EntradaParaModelo,
  type ModoPii,
  type ResultadoMascara,
  type SaidaDoPortao,
  type TipoPii,
} from "./pii";

export {
  MAX_ITERACOES,
  MINIMO_PARA_RESERVA_MS,
  ORCAMENTO_IA_MS,
  PREFERENCIA,
  PROVEDORES_HOMOLOGADOS,
  classificarErroIA,
  deveTentarReserva,
  escolherReserva,
  filtrarReservasHomologadas,
  textoFalhaIA,
  type ClasseErro,
  type Provedor,
} from "./tentativa";

export {
  ASSUNTOS_QUE_VAO_PARA_HUMANO,
  MOLDURA_DE_DADOS_NO_SYSTEM,
  empacotarResultadoTool,
  guardarAfirmacaoDeAcao,
  guardarNumeroSemFerramenta,
  type ResultadoDaGuarda,
} from "./guardas";

export {
  versaoAusente,
  versaoQueAtende,
  type DecisaoDaVersao,
  type MotivoDaVersao,
  type VersaoParaCongelar,
} from "./congelamento";

export {
  REGRA_UMA_PENDENTE,
  TTL_PROPOSTA_MS,
  expiraEmA_partirDe,
  lerResposta,
  motivoDoTtl,
  podeConfirmar,
  type LeituraDaResposta,
  type MotivoRecusa,
  type PropostaParaDecidir,
  type StatusProposta,
  type TipoProposta,
  type VeredictoConfirmacao,
} from "./proposta";

export type {
  AnexoIA,
  MensagemHistorico,
  OpcoesResponder,
  RespostaAgente,
  ToolDoTurno,
  UsoDeTokens,
} from "./tipos";
