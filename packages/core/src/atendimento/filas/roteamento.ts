// Roteamento da fila de atendimento (E1): dada uma fila e o pouco de contexto
// que a conversa carrega, QUEM recebe. Função pura — quem busca membros e carga
// no banco é o app; aqui não há Prisma, relógio nem sorteio.
//
// Nada de aleatório de propósito: distribuição que muda de resposta entre duas
// chamadas com a mesma entrada é impossível de explicar para quem opera ("por
// que essa conversa foi para ela de novo?") e impossível de testar.

import { z } from "zod";

/** Espelha `DistribuicaoFila` do schema (doc 02 §14). */
export const distribuicaoSchema = z.enum(["rodizio", "carga", "carteira", "manual"]);
export type Distribuicao = z.infer<typeof distribuicaoSchema>;

/**
 * Os três contratos abaixo são interfaces `readonly` e não `z.infer`: eles não
 * são borda — o app monta com dado do próprio banco, já tipado pelo Prisma. Zod
 * entra no que vem do TENANT, que aqui é só o `horarioJson` (ver `horario.ts`).
 */
export interface MembroParaRoteamento {
  readonly usuarioId: string;
  readonly ativo: boolean;
  /** Conversas abertas do atendente AGORA — contagem do app, não deste módulo. */
  readonly conversasAbertas: number;
}

export interface FilaParaRoteamento {
  readonly id: string;
  readonly distribuicao: Distribuicao;
  readonly prazoPrimeiraRespostaMin: number | null;
  /** `Fila.horarioJson` cru, como veio do banco. */
  readonly horarioJson: unknown;
  /** Ordem estável definida pela consulta — é ela que o rodízio percorre. */
  readonly membros: readonly MembroParaRoteamento[];
}

export interface ContextoDeRoteamento {
  /** Vendedor dono do cliente (a carteira). */
  readonly vendedorIdDoCliente?: string | undefined;
  /** Quem recebeu a última conversa DESTA fila — o ponteiro do rodízio. */
  readonly ultimoAtendenteId?: string | undefined;
}

/**
 * Próximo depois de `ultimoAtendenteId` na ordem recebida. Se o último não está
 * mais entre os ativos (saiu da fila, entrou de férias), o rodízio recomeça do
 * primeiro em vez de perder a vez — o ponteiro é dica, não estado autoritativo.
 */
function proximoDoRodizio(
  ativos: readonly MembroParaRoteamento[],
  ultimoAtendenteId: string | undefined,
): string | null {
  const anterior =
    ultimoAtendenteId === undefined
      ? -1
      : ativos.findIndex((m) => m.usuarioId === ultimoAtendenteId);
  const indice = anterior < 0 ? 0 : (anterior + 1) % ativos.length;
  return ativos[indice]?.usuarioId ?? null;
}

/**
 * Menor carga. O empate é resolvido pelo menor `usuarioId` e NÃO pela ordem do
 * array: com empate resolvido por ordem, o resultado passaria a depender do
 * `ORDER BY` da consulta e o teste do empate viraria teste da consulta.
 */
function menorCarga(ativos: readonly MembroParaRoteamento[]): string | null {
  let escolhido: MembroParaRoteamento | null = null;
  for (const membro of ativos) {
    if (escolhido === null) {
      escolhido = membro;
      continue;
    }
    if (membro.conversasAbertas < escolhido.conversasAbertas) {
      escolhido = membro;
      continue;
    }
    if (
      membro.conversasAbertas === escolhido.conversasAbertas &&
      membro.usuarioId < escolhido.usuarioId
    ) {
      escolhido = membro;
    }
  }
  return escolhido?.usuarioId ?? null;
}

/**
 * Escolhe o atendente da conversa que entra na fila. `null` = ninguém recebe
 * automaticamente e a conversa fica na fila esperando alguém assumir.
 *
 * Invariante que vale por cima de tudo: NUNCA devolve alguém que não seja membro
 * ativo. Atribuir conversa a quem saiu da fila é conversa que ninguém vê.
 */
export function escolherAtendente(
  fila: FilaParaRoteamento,
  ctx: ContextoDeRoteamento = {},
): string | null {
  const ativos = fila.membros.filter((m) => m.ativo);
  if (ativos.length === 0) return null;

  switch (fila.distribuicao) {
    case "manual":
      return null;

    case "carteira": {
      const dono = ctx.vendedorIdDoCliente;
      // Sem carteira, ou dono que não atende esta fila: cai no rodízio em vez de
      // ficar sem dono. Cliente esperando resposta não é hora de fidelidade.
      if (dono !== undefined && ativos.some((m) => m.usuarioId === dono)) return dono;
      return proximoDoRodizio(ativos, ctx.ultimoAtendenteId);
    }

    case "carga":
      return menorCarga(ativos);

    case "rodizio":
      return proximoDoRodizio(ativos, ctx.ultimoAtendenteId);

    default:
      // A distribuição vem do banco e o enum protege, mas fila mal migrada não
      // pode virar exceção no consumidor da fila de mensagens.
      return null;
  }
}
