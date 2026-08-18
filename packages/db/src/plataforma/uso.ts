// MEDIÇÃO DE CONSUMO E TETO POR PLANO — o encontro das decisões puras de
// `@atende/core/plataforma` com o banco.
//
// É o que faltava para existir cobrança. Os models (`PlanoLicenca`,
// `AssinaturaPlataforma`, `UsoMensal`, `UsoIA`) e as decisões (`decidirTeto`,
// `custoDaExecucaoCentavos`, `mesReferencia`) já existiam, mas ninguém escrevia
// uma linha de consumo nem lia um limite: qualquer tenant usava quanto quisesse
// e o "teto de custo de IA por plano" do painel era promessa de tela.
//
// A divisão de trabalho é a de sempre: aqui não se decide NADA. Preço, teto,
// aviso de 80% e mês de competência são funções puras do núcleo, testadas sem
// Postgres; este arquivo só as alimenta com o que está no banco e grava o
// resultado. Regra prática: se aparecer um `if` sobre número de plano neste
// arquivo, ele está no lugar errado.
//
// Duas linhas por execução, de propósito (doc 02 §10):
//  - `UsoIA` é a trilha por execução — é ela que permite auditar a fatura e
//    recalcular o mês inteiro do zero, porque guarda os tokens crus;
//  - `UsoMensal` é o agregado — é o que a decisão de teto lê a cada turno, sem
//    varrer a trilha. As duas sobem na MESMA transação: agregado que diverge da
//    trilha é fatura que ninguém consegue defender.

import {
  custoDaExecucaoCentavos,
  decidirTeto,
  mesReferencia,
  type DecisaoDeTeto,
  type LimitesDoPlano,
  type UsoDeTokensDaExecucao,
} from "@atende/core";

import { prisma } from "../client";
import { contextoTenantAtual } from "../tenancy";

/** Uma execução de modelo a ser medida. */
export interface DadosDeUsoDeIA {
  readonly provedor: string;
  readonly modelo: string;
  /** O `resposta.uso` do motor entra direto — mesma forma de `UsoDeTokens`. */
  readonly uso: UsoDeTokensDaExecucao;
  /**
   * Conversa que originou a execução. Opcional porque nem todo gasto de modelo
   * nasce de conversa (resumo, treinamento de agente) — e o que não nasce de
   * conversa **não** incrementa o contador de conversas, só o de custo.
   */
  readonly conversaId?: string | null;
  readonly agenteVersaoId?: string | null;
  /** Instante da execução. Entra por parâmetro para o teste poder atravessar meses. */
  readonly quando?: Date;
}

export interface UsoDeIARegistrado {
  readonly usoIaId: string;
  readonly mesReferencia: string;
  readonly custoCentavos: number;
  /** `true` quando esta execução foi a primeira da conversa no mês. */
  readonly contouConversa: boolean;
}

/** Uso apurado do mês. Ausência de linha é consumo zero, nunca erro. */
export interface UsoDoMesApurado {
  readonly mesReferencia: string;
  readonly conversasIa: number;
  readonly mensagens: number;
  readonly tokensEntrada: number;
  readonly tokensSaida: number;
  readonly custoIaCentavos: number;
}

/**
 * Limites do plano vigente + a identidade de quem os concedeu.
 *
 * Estende `LimitesDoPlano` para entrar direto em `decidirTeto`/`podeCriar` sem
 * remontagem, e carrega o resto do plano porque quem pergunta "cabe mais um
 * canal?" quase sempre também precisa dizer, na mesma tela, qual plano é esse.
 */
export interface LimitesVigentes extends LimitesDoPlano {
  readonly assinaturaId: string;
  readonly status: string;
  readonly planoId: string;
  readonly planoChave: string;
  readonly planoNome: string;
  readonly precoMensalCentavos: number;
  readonly permiteApi: boolean;
  readonly apiRateLimitRpm: number;
}

/**
 * Contagem de token vinda de SDK não pode virar crédito nem NaN no banco:
 * `tokensEntrada`/`tokensSaida` são `Int` e uma fração ou um negativo derruba a
 * transação inteira do turno. O núcleo já ignora valor inválido no cálculo do
 * preço; aqui a mesma normalização protege as colunas.
 */
function tokensParaBanco(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Primeiro instante do mês de `quando`, em UTC — mesma régua de `mesReferencia`. */
function inicioDoMesUtc(quando: Date): Date {
  return new Date(Date.UTC(quando.getUTCFullYear(), quando.getUTCMonth(), 1));
}

/** Primeiro instante do mês seguinte (o `Date.UTC` vira o ano sozinho em dezembro). */
function inicioDoMesSeguinteUtc(quando: Date): Date {
  return new Date(Date.UTC(quando.getUTCFullYear(), quando.getUTCMonth() + 1, 1));
}

/**
 * Mede uma execução de modelo: grava a linha de auditoria e sobe o agregado do
 * mês, **na mesma transação**.
 *
 * Roda sob `runWithTenant` — o `empresaId` das duas escritas vem da extension,
 * nunca do chamador (regra inviolável 1). A única exceção é a chave composta do
 * upsert, que precisa do valor literal e o pega do contexto, não de parâmetro.
 *
 * ## `conversasIa` conta CONVERSA, não execução
 *
 * O plano é vendido em conversas com IA (doc 06), e uma conversa tem ~10 turnos
 * (premissa P2). Incrementar por execução cobraria dez vezes o que foi vendido —
 * o tenant estouraria a franquia no primeiro dia e a fatura seria indefensável.
 * Por isso a transação faz uma consulta a mais antes de inserir: se já existe
 * execução DESTA conversa DENTRO do mês, o contador de conversas não sobe.
 * A consulta extra é barata perto de cobrar errado.
 *
 * Limite conhecido: dois turnos da mesma conversa medidos ao mesmo tempo podem
 * contar duas conversas, porque cada transação lê antes de a outra inserir. Na
 * prática o consumer de IA é serializado por conversa (`singletonKey` no
 * enqueue + a checagem `jaRespondido`), e a correção definitiva é um índice
 * parcial `(empresaId, conversaId, mês)` — migration, não código.
 */
export async function registrarUsoDeIA(dados: DadosDeUsoDeIA): Promise<UsoDeIARegistrado> {
  const { empresaId } = contextoTenantAtual();

  const quando = dados.quando ?? new Date();
  const mes = mesReferencia(quando);

  const entrada = tokensParaBanco(dados.uso.entrada);
  const saida = tokensParaBanco(dados.uso.saida);

  // Modelo fora da tabela de preços NÃO derruba o turno: o núcleo devolve o
  // preço de desconhecido (o mais caro que conhecemos, fail-closed) e a
  // distorção aparece no painel de consumo, onde alguém acrescenta a linha que
  // falta. Estourar aqui transformaria "esqueci de cadastrar um preço" em
  // "o cliente ficou sem resposta".
  const custoCentavos = custoDaExecucaoCentavos({ entrada, saida }, dados.provedor, dados.modelo);

  const conversaId = dados.conversaId ?? null;

  return prisma.$transaction(async (tx) => {
    let contouConversa = false;
    if (conversaId) {
      const anterior = await tx.usoIA.findFirst({
        where: {
          conversaId,
          criadoEm: { gte: inicioDoMesUtc(quando), lt: inicioDoMesSeguinteUtc(quando) },
        },
        select: { id: true },
      });
      contouConversa = anterior === null;
    }

    const linha = await tx.usoIA.create({
      data: {
        conversaId,
        agenteVersaoId: dados.agenteVersaoId ?? null,
        provedor: dados.provedor,
        modelo: dados.modelo,
        tokensEntrada: entrada,
        tokensSaida: saida,
        custoEstimadoCentavos: custoCentavos,
        // `criadoEm` explícito, e não o default do banco: é o MESMO instante que
        // decidiu o `mesReferencia` e a janela da checagem acima. Deixar o
        // relógio do Postgres carimbar abriria, na virada do mês, a chance de a
        // linha cair em agosto e o agregado em setembro.
        criadoEm: quando,
      } as never,
    });

    await tx.usoMensal.upsert({
      // Única `where` com `empresaId` escrito à mão neste repositório de app, e
      // por necessidade: a chave é composta (`@@unique([empresaId, mesReferencia])`)
      // e o Prisma exige o objeto completo. O valor vem do contexto de tenant —
      // se divergisse, a extension recusaria a query antes de ela sair daqui.
      where: { empresaId_mesReferencia: { empresaId, mesReferencia: mes } },
      create: {
        mesReferencia: mes,
        conversasIa: contouConversa ? 1 : 0,
        tokensEntrada: entrada,
        tokensSaida: saida,
        custoIaCentavos: custoCentavos,
      } as never,
      update: {
        conversasIa: { increment: contouConversa ? 1 : 0 },
        tokensEntrada: { increment: entrada },
        tokensSaida: { increment: saida },
        // Soma o valor JÁ ARREDONDADO da linha de auditoria, e não o exato, para
        // que o agregado seja sempre igual à soma das linhas do `UsoIA` — a
        // conta que o tenant vai refazer quando contestar a fatura. O viés
        // (turno de fração de centavo somando zero) é conhecido e não afeta o
        // teto, que é decidido por CONVERSA; o custo exato do mês continua
        // recalculável a partir dos tokens crus da trilha.
        custoIaCentavos: { increment: custoCentavos },
      },
    });

    return {
      usoIaId: linha.id,
      mesReferencia: mes,
      custoCentavos,
      contouConversa,
    };
  });
}

/**
 * Consumo agregado do mês de `quando`.
 *
 * Mês sem linha devolve zeros: o primeiro turno do mês é exatamente o caso em
 * que a linha ainda não existe, e fazer o teto estourar por isso recusaria IA
 * justamente a quem não consumiu nada.
 */
export async function usoDoMes(quando: Date = new Date()): Promise<UsoDoMesApurado> {
  const mes = mesReferencia(quando);

  // `findFirst` e não `findUnique`: a chave composta exigiria o `empresaId`
  // literal, e o filtro de tenant é trabalho da extension.
  const linha = await prisma.usoMensal.findFirst({ where: { mesReferencia: mes } });

  return {
    mesReferencia: mes,
    conversasIa: linha?.conversasIa ?? 0,
    mensagens: linha?.mensagens ?? 0,
    tokensEntrada: linha?.tokensEntrada ?? 0,
    tokensSaida: linha?.tokensSaida ?? 0,
    custoIaCentavos: linha?.custoIaCentavos ?? 0,
  };
}

/**
 * Limites do plano contratado, ou `null` quando a empresa não tem assinatura.
 *
 * O plano é lido pela RELAÇÃO da assinatura (`include`), nunca por consulta
 * direta a `PlanoLicenca`: o catálogo é global (não tem `empresaId`) e não está
 * na allowlist `MODELS_GLOBAIS` da extension, então consultá-lo de dentro de um
 * tenant seria erro de tenancy. Chegar por relação também é o desenho certo —
 * o tenant enxerga o plano DELE, o que existe no catálogo não é assunto dele.
 *
 * `null` é resposta legítima, não falha: empresa criada antes de contratar
 * existe. Quem chama trata como "sem plano" e decide o que isso significa no
 * contexto dele — `podeUsarIA` trata como recusa, o painel trata como convite a
 * contratar.
 */
export async function limitesVigentes(): Promise<LimitesVigentes | null> {
  const assinatura = await prisma.assinaturaPlataforma.findFirst({
    // `status` é a verdade do ciclo de vida; `canceladaEm` entra junto porque um
    // cancelamento gravado pela metade (carimbo sem status) não pode devolver
    // limites a quem já saiu.
    where: { status: { not: "cancelada" }, canceladaEm: null },
    // Não deveria haver duas — se houver, vale a mais recente, e a antiga é
    // resíduo de migração, não a que o cliente contratou.
    orderBy: { iniciadaEm: "desc" },
    include: { plano: true },
  });
  if (!assinatura) return null;

  const plano = assinatura.plano;
  return {
    assinaturaId: assinatura.id,
    // `inadimplente` e `trial` também devolvem limites, de propósito: o que a
    // inadimplência decide é se o tenant ENTRA (portão de sessão), não quanto
    // ele já gastou. O `status` sai junto para esse portão poder existir sem
    // reabrir esta consulta.
    status: assinatura.status,
    planoId: plano.id,
    planoChave: plano.chave,
    planoNome: plano.nome,
    precoMensalCentavos: plano.precoMensalCentavos,
    permiteApi: plano.permiteApi,
    apiRateLimitRpm: plano.apiRateLimitRpm,
    limiteUsuarios: plano.limiteUsuarios,
    limiteCanais: plano.limiteCanais,
    limiteConversasIaMes: plano.limiteConversasIaMes,
    excedenteIaCentavos: plano.excedenteIaCentavos,
  };
}

/**
 * O próximo turno de IA pode acontecer?
 *
 * Portão do motor caro, não do atendimento: recusado, a conversa vai ao humano
 * e ao fluxo determinístico — o cliente continua sendo atendido (doc 06 §1,
 * doc 12 §5.6). Por isso quem chama NUNCA deve tratar a recusa como erro.
 *
 * Sem assinatura é recusa, e isso é decisão: consumo de modelo custa dinheiro de
 * verdade, e sem plano não há quem o pague nem teto que o segure. Fail-closed
 * aqui é barato (a conversa segue com gente), e fail-open é uma conta que chega
 * sem ninguém do outro lado.
 *
 * O `motivo` é texto para o TENANT — fala de plano e de limite. Ele vai para o
 * log e para o painel; **nunca** para o cliente final, que não tem nada a ver
 * com o contrato do distribuidor.
 */
export async function podeUsarIA(quando: Date = new Date()): Promise<DecisaoDeTeto> {
  // Em paralelo porque as duas leituras entram no caminho de TODO turno: são
  // independentes e uma ida ao banco a menos é orçamento que sobra para o modelo.
  const [limites, uso] = await Promise.all([limitesVigentes(), usoDoMes(quando)]);

  if (!limites) {
    return {
      permite: false,
      motivo:
        "Não encontramos um plano ativo para esta empresa, então o atendimento por IA está desligado. As conversas seguem pelo fluxo automático e pela fila humana.",
    };
  }

  return decidirTeto(uso, limites);
}
