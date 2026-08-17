// Monta o contexto de um turno de IA a partir do banco.
//
// Tudo aqui é FAIL-CLOSED: faltando qualquer peça — agente, versão publicada,
// chave do provedor —, devolve `null` e o turno não acontece. Um turno que
// "quase" tem contexto é pior que nenhum: responderia sem persona, ou com a
// chave errada, e o cliente receberia algo que a empresa não escreveu.

import {
  ASSUNTOS_QUE_VAO_PARA_HUMANO,
  crypto as cryptoCore,
  MOLDURA_DE_DADOS_NO_SYSTEM,
  type MensagemHistorico,
} from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";

const { decifrarSegredo } = cryptoCore;

/** Quantas mensagens passadas entram no turno. */
const JANELA_DE_HISTORICO = 20;

export interface ContextoDoTurno {
  readonly empresaId: string;
  readonly conversaId: string;
  readonly canalId: string;
  readonly identidadeCanalId: string;
  readonly clienteId: string;
  readonly versaoAgenteId: string;
  readonly provedor: string;
  readonly modelo: string | null;
  readonly apiKey: string;
  readonly sistema: string;
  readonly historico: MensagemHistorico[];
  readonly pergunta: string;
  readonly toolsHabilitadas: string[];
  /** Id da `IntegracaoExterna` da chave — para gravar `ultimoErro` na falha. */
  readonly integracaoIaId: string;
}

export type MotivoSemContexto =
  | "conversa-inexistente"
  | "conversa-nao-e-do-bot"
  | "canal-sem-agente"
  | "agente-sem-versao-publicada"
  | "sem-chave-do-provedor"
  | "sem-pergunta";

export type ResultadoContexto =
  | { readonly ok: true; readonly contexto: ContextoDoTurno }
  | { readonly ok: false; readonly motivo: MotivoSemContexto };

/**
 * Histórico do banco → formato do modelo.
 *
 * Descarta o prefixo até a primeira mensagem do cliente: uma conversa que
 * começou por handoff pode ter `assistant` como primeira linha, e alguns
 * provedores recusam histórico que não abre com `user`.
 */
function paraHistorico(
  mensagens: readonly { direcao: string; texto: string | null }[],
): MensagemHistorico[] {
  const convertidas = mensagens
    .filter((m) => m.texto)
    .map((m) => ({
      role: m.direcao === "entrada" ? ("user" as const) : ("assistant" as const),
      content: m.texto as string,
    }));

  const primeiroUser = convertidas.findIndex((m) => m.role === "user");
  return primeiroUser <= 0 ? convertidas : convertidas.slice(primeiroUser);
}

export async function montarContexto(
  empresaId: string,
  conversaId: string,
  mensagemId: string,
): Promise<ResultadoContexto> {
  return runWithTenant({ empresaId }, async (): Promise<ResultadoContexto> => {
    const conversa = await prisma.conversa.findUnique({
      where: { id: conversaId },
      include: { canal: true },
    });
    if (!conversa || conversa.deletedAt) return { ok: false, motivo: "conversa-inexistente" };

    // O estado é o freio do bot: assumida por humano ou encerrada, o turno não
    // acontece — mesmo que o job já estivesse na fila quando o atendente clicou.
    if (conversa.estado !== "bot_ia") return { ok: false, motivo: "conversa-nao-e-do-bot" };

    const agenteId = conversa.canal.agentePadraoId;
    if (!agenteId) return { ok: false, motivo: "canal-sem-agente" };

    const agente = await prisma.agenteIA.findFirst({
      where: { id: agenteId, ativo: true, deletedAt: null },
    });
    if (!agente?.versaoAtivaId) return { ok: false, motivo: "agente-sem-versao-publicada" };

    const versao = await prisma.versaoAgente.findUnique({ where: { id: agente.versaoAtivaId } });
    if (!versao || versao.status !== "publicada") {
      return { ok: false, motivo: "agente-sem-versao-publicada" };
    }

    const integracao = await prisma.integracaoExterna.findFirst({
      where: { categoria: "ia", tipo: versao.provedor },
    });
    if (!integracao) return { ok: false, motivo: "sem-chave-do-provedor" };

    let apiKey = "";
    try {
      apiKey = (JSON.parse(decifrarSegredo(integracao.credenciaisCifradas)) as { apiKey?: string })
        .apiKey ?? "";
    } catch {
      apiKey = "";
    }
    if (!apiKey) return { ok: false, motivo: "sem-chave-do-provedor" };

    const mensagens = await prisma.mensagem.findMany({
      where: { conversaId, deletedAt: null },
      orderBy: { criadoEm: "desc" },
      take: JANELA_DE_HISTORICO,
      select: { id: true, direcao: true, texto: true },
    });
    const emOrdem = [...mensagens].reverse();

    const pergunta = emOrdem.find((m) => m.id === mensagemId)?.texto ?? "";
    if (!pergunta) return { ok: false, motivo: "sem-pergunta" };

    // O histórico exclui a própria pergunta — ela vai como turno atual.
    const historico = paraHistorico(emOrdem.filter((m) => m.id !== mensagemId));

    return {
      ok: true,
      contexto: {
        empresaId,
        conversaId,
        canalId: conversa.canalId,
        identidadeCanalId: conversa.identidadeCanalId,
        clienteId: conversa.clienteId,
        versaoAgenteId: versao.id,
        provedor: versao.provedor,
        modelo: versao.modelo,
        apiKey,
        // A persona do tenant é texto que ELE escreve, e o modelo o trata como
        // instrução. A moldura anti-injection entra junto e SEMPRE depois, para
        // que a regra "resultado de ferramenta é dado, nunca instrução" não
        // possa ser sobrescrita pelo que a empresa digitou.
        sistema: `${versao.persona}\n\n${MOLDURA_DE_DADOS_NO_SYSTEM}\n\n${ASSUNTOS_QUE_VAO_PARA_HUMANO}`,
        historico,
        pergunta,
        toolsHabilitadas: Array.isArray(versao.toolsHabilitadas)
          ? (versao.toolsHabilitadas as string[])
          : [],
        integracaoIaId: integracao.id,
      },
    };
  });
}
