// O TURNO DE IA — onde o agente do tenant responde ao cliente.
//
// Roda no worker, e não no request do Cloudflare Workers, por limite físico: um
// turno tem orçamento de 40 s e o plano gratuito dá 10 ms de CPU por request
// (doc 12 §2.2). Aqui é o único lugar do produto que fala com provedor de modelo.
//
// O que este arquivo NÃO faz, de propósito:
//  - não envia mensagem: grava `Mensagem` pendente e o outbox entrega (≤ 3 s),
//    então todo o caminho de envio, retry e recibo é o mesmo do humano;
//  - não decide nada sobre orçamento, PII ou classificação de erro: essas
//    regras são puras e vivem em `@atende/core`, testadas isoladamente.

import {
  MAX_ITERACOES,
  ORCAMENTO_IA_MS,
  classificarErroIA,
  guardarAfirmacaoDeAcao,
  guardarNumeroSemFerramenta,
  textoFalhaIA,
} from "@atende/core";
import { podeUsarIA, prisma, registrarUsoDeIA, runWithTenant } from "@atende/db";
import { responder } from "@atende/ia";
import type { RespostaAgente } from "@atende/core";
import type PgBoss from "pg-boss";

import { FILAS, obterFila } from "../fila.js";
import { montarContexto } from "../ia/contexto.js";
import { jobIaTurnoSchema, type JobIaTurno } from "../ia/enfileirar.js";

/**
 * Já respondemos a esta mensagem?
 *
 * `singletonKey` no enqueue deduplica jobs em `created`, mas um job já `active`
 * não bloqueia outro — então a garantia final é esta, no banco: se existe
 * qualquer saída criada depois da mensagem que originou o job, o turno já
 * aconteceu e repetir custaria dinheiro e mandaria duas respostas ao cliente.
 */
async function jaRespondido(conversaId: string, mensagemId: string): Promise<boolean> {
  const origem = await prisma.mensagem.findUnique({
    where: { id: mensagemId },
    select: { criadoEm: true },
  });
  if (!origem) return true; // mensagem sumiu: não há o que responder

  const posterior = await prisma.mensagem.findFirst({
    where: { conversaId, direcao: "saida", criadoEm: { gt: origem.criadoEm } },
    select: { id: true },
  });
  return posterior !== null;
}

async function gravarSaida(
  conversaId: string,
  canalId: string,
  texto: string,
): Promise<void> {
  // `pendente` é o contrato do outbox: a tabela Mensagem É a fila de saída.
  await prisma.mensagem.create({
    data: {
      canalId,
      conversaId,
      direcao: "saida",
      origemMotor: "ia",
      texto,
      statusEntrega: "pendente",
    } as never,
  });
  // Toque para o pulso da inbox perceber (assinatura é max(atualizadoEm)).
  await prisma.conversa.update({ where: { id: conversaId }, data: { atualizadoEm: new Date() } });
}

/** Entrega a conversa a um humano e explica ao cliente, sem deixá-lo no vácuo. */
async function entregarAoHumano(
  conversaId: string,
  canalId: string,
  texto: string,
): Promise<void> {
  await gravarSaida(conversaId, canalId, texto);
  await prisma.conversa.update({
    where: { id: conversaId },
    data: { estado: "fila_humano" },
  });
}

/**
 * Mede o que a execução consumiu — trilha de auditoria + agregado do mês.
 *
 * Falha de medição NÃO custa a resposta ao cliente: os tokens já foram gastos
 * quando o provedor respondeu, e abortar aqui faria o retry pagar o mesmo turno
 * de novo (e arriscar mandar duas respostas). O erro vai para o log em voz alta
 * porque consumo não medido é dinheiro que ninguém cobra — e a trilha pode ser
 * reconstruída, a resposta perdida não.
 */
async function medirConsumo(
  conversaId: string,
  versaoAgenteId: string,
  resposta: RespostaAgente,
): Promise<void> {
  try {
    await registrarUsoDeIA({
      conversaId,
      agenteVersaoId: versaoAgenteId,
      provedor: resposta.provedor,
      modelo: resposta.modelo,
      uso: resposta.uso,
    });
  } catch (e) {
    console.error(`[ia-turno] FALHA AO MEDIR CONSUMO da conversa ${conversaId}:`, e);
  }
}

async function executarTurno(job: JobIaTurno): Promise<void> {
  const { empresaId, conversaId, mensagemId } = jobIaTurnoSchema.parse(job);

  const resultado = await montarContexto(empresaId, conversaId, mensagemId);
  if (!resultado.ok) {
    // Faltar contexto é quase sempre configuração incompleta, não falha. Só
    // avisa o cliente quando ele ficaria esperando: sem chave configurada, a
    // conversa está em `bot_ia` e ninguém responderia nunca.
    console.warn(`[ia-turno] sem contexto (${resultado.motivo}) — conversa ${conversaId}`);
    if (resultado.motivo === "chave-do-provedor-ilegivel") {
      console.error(
        `[ia-turno] a chave do provedor está gravada mas não abre — a ENCRYPTION_KEY mudou ` +
          `desde que ela foi salva. Recadastre o segredo em Integrações. Empresa ${empresaId}.`,
      );
    }
    if (
      resultado.motivo === "sem-chave-do-provedor" ||
      resultado.motivo === "chave-do-provedor-ilegivel" ||
      resultado.motivo === "agente-sem-versao-publicada"
    ) {
      await runWithTenant({ empresaId }, async () => {
        const conversa = await prisma.conversa.findUnique({
          where: { id: conversaId },
          select: { canalId: true },
        });
        if (conversa) {
          await entregarAoHumano(
            conversaId,
            conversa.canalId,
            "Recebi sua mensagem! Um atendente vai continuar com você em instantes.",
          );
        }
      });
    }
    return;
  }

  const ctx = resultado.contexto;

  await runWithTenant({ empresaId }, async () => {
    if (await jaRespondido(conversaId, mensagemId)) {
      console.log(`[ia-turno] conversa ${conversaId} já respondida — ignorando`);
      return;
    }

    // TETO DO PLANO, antes de qualquer token ser gasto. Recusado, o provedor
    // NÃO é chamado — é essa a diferença entre teto e relatório: medir depois de
    // gastar conta a história, não a muda.
    //
    // A degradação é para fluxo determinístico + fila humana (doc 06 §1,
    // doc 12 §5.6): o atendimento não para, o que para é a IA. E o `motivo` da
    // decisão fica no LOG, não na mensagem: ele fala do plano e do limite do
    // TENANT, e o cliente do outro lado não tem nada a ver com o contrato do
    // distribuidor — ele recebe o mesmo aviso neutro de quando falta chave.
    const teto = await podeUsarIA();
    if (!teto.permite) {
      console.warn(`[ia-turno] teto do plano recusou a conversa ${conversaId}: ${teto.motivo}`);
      await entregarAoHumano(
        conversaId,
        ctx.canalId,
        "Recebi sua mensagem! Um atendente vai continuar com você em instantes.",
      );
      return;
    }
    if (teto.avisar) {
      console.warn(
        `[ia-turno] empresa ${empresaId} passou de 80% da franquia de IA do mês ` +
          `(restam ${teto.restante} conversas)`,
      );
    }

    try {
      const resposta = await responder(ctx.pergunta, {
        provedor: ctx.provedor as never,
        ...(ctx.modelo ? { modelo: ctx.modelo } : {}),
        // A chave vem SEMPRE do tenant. O adapter tem fallback para
        // `process.env.ANTHROPIC_API_KEY`, e como o worker roda na máquina do
        // dono com a chave dele no `.env`, esse fallback gastaria a chave do
        // dono por conta de outro tenant — em silêncio. `montarContexto` já
        // recusa contexto sem chave; aqui a passagem explícita fecha o caminho.
        apiKey: ctx.apiKey,
        sistema: ctx.sistema,
        historico: ctx.historico,
        maxIteracoes: MAX_ITERACOES,
        orcamentoMs: ORCAMENTO_IA_MS,
        modoPii: "mascarar",
      });

      // Medir ANTES de qualquer decisão sobre o texto: o gasto aconteceu na
      // chamada acima, e turno que vira handoff (resposta vazia, guarda que
      // trocou o texto) consumiu token igual. Medir só o caminho feliz mediria
      // menos do que a fatura do provedor vai mostrar.
      await medirConsumo(conversaId, ctx.versaoAgenteId, resposta);

      const texto = resposta.texto.trim();
      if (!texto) {
        await entregarAoHumano(
          conversaId,
          ctx.canalId,
          "Vou chamar alguém da equipe para te ajudar com isso.",
        );
        return;
      }

      // Nenhuma proposta é executada nesta fase, então a guarda roda no regime
      // mais estrito: com zero execuções, qualquer afirmação de ação concluída
      // ("já agendei", "pedido confirmado") é alucinação e o texto é trocado.
      const guardaAcao = guardarAfirmacaoDeAcao(texto, 0);
      if (guardaAcao.bloqueou) {
        console.warn(`[ia-turno] guarda anti-alucinação agiu na conversa ${conversaId}`);
      }

      // E o registro de ferramentas está vazio — nenhuma tool é passada ao
      // modelo neste turno —, então TODO número de preço, estoque, crédito,
      // prazo ou tributo que aparecer veio da memória do modelo. A contagem é
      // literalmente zero, e é isso que a guarda recebe. Enquanto o E2 não
      // conectar a leitura do ERP, esse assunto é de pessoa.
      const guarda = guardarNumeroSemFerramenta(guardaAcao.texto, 0);
      if (guarda.bloqueou) {
        console.warn(`[ia-turno] guarda de número agiu na conversa ${conversaId}`);
      }

      await gravarSaida(conversaId, ctx.canalId, guarda.texto);
      console.log(
        `[ia-turno] respondeu ${conversaId} (${resposta.provedor}/${resposta.modelo}, ` +
          `${resposta.uso.entrada}+${resposta.uso.saida} tokens)`,
      );
    } catch (e) {
      const classe = classificarErroIA(e);
      console.error(`[ia-turno] falha (${classe}) na conversa ${conversaId}:`, e);

      // `ultimoErro` é o campo que a tela de integrações renderiza e que, até
      // aqui, ninguém escrevia. Credencial ruim é o caso que o tenant precisa
      // ver para agir — os outros são transitórios e poluiriam a tela.
      if (classe === "credencial") {
        await prisma.integracaoExterna.update({
          where: { id: ctx.integracaoIaId },
          data: { status: "erro", ultimoErro: "Chave recusada pelo provedor de IA." },
        });
      }

      await entregarAoHumano(conversaId, ctx.canalId, textoFalhaIA());
    }
  });
}

export async function iniciarConsumerIaTurno(): Promise<void> {
  await obterFila().work<JobIaTurno>(
    FILAS.iaTurno,
    { batchSize: 1, pollingIntervalSeconds: 1 },
    // v10 entrega um ARRAY de jobs, mesmo com batchSize 1.
    async (jobs: PgBoss.Job<JobIaTurno>[]) => {
      for (const job of jobs) {
        await executarTurno(job.data);
      }
    },
  );
  console.log("[worker] consumer ia-turno ativo");
}
