/**
 * CHASSI DE UI DO MENSVRA CHANNEL — a superfície pública do pacote.
 *
 * ORIGEM E REGIME. Este pacote é uma CÓPIA ADAPTADA de `@mensvra-erp/ui` (o chassi do
 * Mensvra ERP), não uma dependência dele: os dois produtos são independentes e precisam
 * evoluir em ritmos diferentes — é a mesma regra que o `docs/08-reuso-ev-tracker.md`
 * aplica ao ev-tracker. O que se compartilha com o ERP é a IDENTIDADE (a paleta navy /
 * azul elétrico / roxo, os tokens em oklch, a geometria), para que os dois produtos da
 * família Mensvra pareçam irmãos; o que NÃO se compartilha é código vivo.
 *
 * A folha de estilo é um export à parte e precisa ser importada UMA vez pelo app:
 *
 *     import '@atende/ui/estilos.css'
 *
 * O pacote é TypeScript-fonte, sem passo de build — `apps/web` o compila via
 * `transpilePackages`. Regime de resolução `bundler`: **nenhum import relativo leva
 * extensão `.js`** (doc 11 — um `.js` reintroduzido aqui derruba o build do web inteiro,
 * e o Workers Builds falha de um jeito que deixa as rotas novas em 404).
 *
 * O QUE FICOU DE FORA DA CÓPIA, E POR QUÊ — cada bloco tem um motivo, não é acaso:
 *
 * - `escopo/` (seletor de empresa/filial multiempresa) — **motivo de segurança.** No
 *   Mensvra Channel o tenant vem SEMPRE da sessão JWT e nunca de escolha na interface
 *   (regra inviolável 3 do CLAUDE.md). Um seletor de empresa na tela seria um caminho
 *   para trocar de tenant pela UI; não existe versão "só visual" disso que seja segura.
 * - `telas/` (TelaDeLista, TelaDeDetalhe, TelaDePainel) e `tabela/` (TabelaDensa) —
 *   anatomia de ERP: trilha + KPIs + grid virtualizado de mil linhas + rodapé de recorte
 *   multiempresa. Arrastam `escopo/` e o motor de drill-down. Uma inbox de atendimento
 *   não tem essa forma.
 * - `referencia/` (drill-down por tipo de registro) e `componentes/Trilha` — dependem da
 *   ponte com o shell de abas do ERP, que não existe aqui.
 * - `formulario/` — depende de `@mensvra-erp/contracts/campos` (CNPJ, NCM, inscrição
 *   estadual): domínio fiscal que este produto não tem. Quando o estúdio de agentes e o
 *   catálogo precisarem de formulários ricos, portar SEM os campos fiscais e reativar o
 *   `@import` que está comentado no topo de `estilos/chassi.css`.
 * - `graficos/` — 4,2 mil linhas de SVG autoral. Entra quando houver métrica para
 *   desenhar (Fase D: painel de consumo e desempenho do agente), não antes.
 */

// ─────────────────────────────────────────────────────────────────── base
export { cn } from './base/cn'
export { Icone, NOMES_DE_ICONE, ehNomeDeIcone, type NomeDeIcone } from './base/icones'

// ───────────────────────────────────────────────────────────── formatação
export {
  TRACO,
  UFS_COM_MASCARA_DE_IE,
  diferencaEmDias,
  formatarCep,
  formatarChaveDeAcesso,
  formatarCnpj,
  formatarCpf,
  formatarData,
  formatarDataCurta,
  formatarDataExtenso,
  formatarDataHora,
  formatarDocumento,
  formatarHora,
  formatarInscricaoEstadual,
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
  formatarQuantidade,
  formatarRelativo,
  formatarTelefone,
  lerData,
  paraDinheiro,
  pluralizar,
  somenteDigitos,
  type EntradaDeData,
  type OpcoesDeQuantidade,
  type PartesDeData,
} from './formato/index'

// ─────────────────────────────────────────────────────────────────── status
export {
  CHAVES_DE_STATUS,
  VOCABULARIO_DE_STATUS,
  definicaoDoStatus,
  ehChaveDeStatus,
  rotuloDoStatus,
  tomDoStatus,
  variavelDoTom,
  type ChaveDeStatus,
  type DefinicaoDeStatus,
  type TomDeStatus,
} from './status/vocabulario'

// ────────────────────────────────────────────────── componentes de apoio
export { Botao, type PropsBotao, type VarianteDeBotao } from './componentes/Botao'
export { Badge, type PropsBadge } from './componentes/Badge'
export {
  Chip,
  FiltroPilulas,
  type OpcaoDeFiltro,
  type PropsChip,
  type PropsFiltroPilulas,
} from './componentes/Chip'
export { BuscaLocal, type PropsBuscaLocal } from './componentes/BuscaLocal'
export { FaixaDeKpis, Kpi, type DefinicaoDeKpi } from './componentes/Kpi'
export {
  AbasInternas,
  type AbaInterna,
  type PropsAbasInternas,
} from './componentes/AbasInternas'
export {
  EstadoDeErro,
  EstadoVazio,
  Esqueleto,
  EsqueletoDeTabela,
  type PropsEstadoDeErro,
  type PropsEstadoVazio,
} from './componentes/Estados'
export {
  Confirmar,
  Modal,
  type PropsConfirmar,
  type PropsModal,
  type TamanhoDeModal,
} from './componentes/Modal'
export {
  ProvedorDeToast,
  useToast,
  type OpcoesDeToast,
  type TomDeToast,
} from './componentes/Toast'
