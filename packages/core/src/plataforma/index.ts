/**
 * PLATAFORMA — medição de consumo e teto por plano.
 *
 * É o que faltava para existir cobrança: os models (`PlanoLicenca`,
 * `AssinaturaPlataforma`, `UsoMensal`, `UsoIA`) já existiam, mas ninguém
 * respondia às três perguntas que transformam consumo em dinheiro e em limite:
 * quanto custou esta execução, este turno de IA pode acontecer, e cabe mais um
 * usuário/canal neste plano.
 *
 * Tudo puro e por parâmetro — o app lê `UsoMensal` e `PlanoLicenca` e passa. É o
 * que permite testar o mês inteiro (inclusive a virada de ano e o estouro do
 * teto) sem Postgres, e o que vai permitir trocar a origem do uso — banco hoje,
 * cache do worker amanhã — sem tocar em nenhuma decisão daqui.
 *
 * O que NÃO mora aqui, e por quê:
 * - **Gravar `UsoIA`/`UsoMensal`** — é escrita, e escrita é do worker
 *   (`consumers/plataforma.ts`), onde a auditoria de tenancy existe.
 * - **Estado da assinatura** (trial vencido, inadimplente) — decide se o tenant
 *   entra, não quanto ele gastou; é portão de sessão, não de consumo.
 * - **Emissão de fatura e split** — Fase F, com o provedor de pagamento.
 */

export {
  COTACAO_DE_REFERENCIA,
  PRECO_DE_MODELO_DESCONHECIDO,
  PRECO_POR_MODELO,
  chaveDoPreco,
  custoDaExecucaoCentavos,
  custoDaExecucaoCentavosExato,
  precoDoModelo,
  type PrecoDoModelo,
  type UsoDeTokensDaExecucao,
} from "./precos";

export {
  FRACAO_DE_AVISO,
  ILIMITADO,
  decidirTeto,
  ehIlimitado,
  excedenteDoMesCentavos,
  podeCriar,
  type DecisaoDeTeto,
  type LimitesDoPlano,
  type RecursoLimitado,
  type UsoDoMes,
} from "./limites";

export { mesReferencia, mesSeguinte } from "./periodo";
