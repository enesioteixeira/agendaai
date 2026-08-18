// Camada de dados das FILAS DE ATENDIMENTO e do CICLO DE VIDA DA CONVERSA (E1).
//
// Divisão de trabalho com `@atende/core/atendimento/filas`: a decisão é lá e é
// pura (quem recebe, até quando, se a fila está aberta); aqui é só o I/O que
// alimenta essa decisão e o que grava o resultado. Nenhuma regra de escolha de
// atendente ou de contagem de prazo é reimplementada neste arquivo — se alguma
// aparecer aqui, ela nasceu no lugar errado.
//
// Tenancy: todas as funções deste módulo pressupõem `runWithTenant` já aberto
// pelo chamador (server action do painel / consumidor do worker). Elas NÃO
// recebem `empresaId` de propósito — a identidade do tenant vem da sessão
// (regra inviolável 3) e a extension injeta o filtro em toda query (regra 1).
// É por isso que "id de outro tenant" nunca vira leitura silenciosa: o
// `findFirst` simplesmente não acha, e a mensagem de erro é explícita.
//
// Zod: a borda (payload da server action, payload do job) valida com os schemas
// de `@atende/core` — `packages/db` não tem zod como dependência direta de
// propósito. O único dado de tenant em formato livre que passa por aqui é o
// `Fila.horarioJson`, e ele é validado com `horarioFilaSchema`, o MESMO schema
// que o núcleo usa para ler o expediente: expediente que o roteador não
// entenderia não pode ser gravado em silêncio e virar fila 24 por 7.

import {
  calcularPrazoPrimeiraResposta,
  escolherAtendente,
  horarioFilaSchema,
  situacaoDoPrazo,
  type Distribuicao,
  type FilaParaRoteamento,
  type MembroParaRoteamento,
  type SituacaoPrazo,
} from "@atende/core";
import type { EstadoConversa } from "@prisma/client";

import { Prisma } from "../client";
import { prisma } from "../client";

/** Página padrão da inbox. Teto para não transformar filtro solto em varredura. */
const LIMITE_PADRAO_INBOX = 50;
const LIMITE_MAXIMO_INBOX = 200;

/** Piso de comparação de "mensagens desde a última resposta" (conversa nunca respondida). */
const EPOCA = new Date(0);

// ─────────────────────────────────────────────────────────────
// Filas — cadastro
// ─────────────────────────────────────────────────────────────

export interface MembroDaFila {
  usuarioId: string;
  nome: string;
  email: string;
  ativo: boolean;
}

export interface FilaDetalhada {
  id: string;
  nome: string;
  descricao: string | null;
  prazoPrimeiraRespostaMin: number | null;
  prazoResolucaoMin: number | null;
  distribuicao: Distribuicao;
  /** `horarioJson` cru, como o núcleo espera receber (`lerExpediente`). */
  horarioJson: unknown;
  mensagemForaHorario: string | null;
  ativa: boolean;
  ordem: number;
  criadoEm: Date;
  membros: MembroDaFila[];
}

export interface DadosDaFila {
  nome: string;
  descricao?: string | null;
  prazoPrimeiraRespostaMin?: number | null;
  prazoResolucaoMin?: number | null;
  distribuicao?: Distribuicao;
  horarioJson?: unknown;
  mensagemForaHorario?: string | null;
  ordem?: number;
  ativa?: boolean;
}

const SELECT_FILA = {
  id: true,
  nome: true,
  descricao: true,
  prazoPrimeiraRespostaMin: true,
  prazoResolucaoMin: true,
  distribuicao: true,
  horarioJson: true,
  mensagemForaHorario: true,
  ativa: true,
  ordem: true,
  criadoEm: true,
  membros: {
    select: { usuarioId: true, ativo: true, usuario: { select: { nome: true, email: true } } },
    orderBy: { usuario: { nome: "asc" } },
  },
} satisfies Prisma.FilaSelect;

type FilaComMembros = Prisma.FilaGetPayload<{ select: typeof SELECT_FILA }>;

function montarFila(fila: FilaComMembros): FilaDetalhada {
  return {
    id: fila.id,
    nome: fila.nome,
    descricao: fila.descricao,
    prazoPrimeiraRespostaMin: fila.prazoPrimeiraRespostaMin,
    prazoResolucaoMin: fila.prazoResolucaoMin,
    distribuicao: fila.distribuicao,
    horarioJson: fila.horarioJson,
    mensagemForaHorario: fila.mensagemForaHorario,
    ativa: fila.ativa,
    ordem: fila.ordem,
    criadoEm: fila.criadoEm,
    membros: fila.membros.map((m) => ({
      usuarioId: m.usuarioId,
      nome: m.usuario.nome,
      email: m.usuario.email,
      ativo: m.ativo,
    })),
  };
}

function exigirTexto(valor: string, campo: string): string {
  const limpo = valor.trim();
  if (limpo.length === 0) throw new Error(`${campo} é obrigatório.`);
  return limpo;
}

function validarPrazo(valor: number | null | undefined, campo: string): void {
  if (valor === null || valor === undefined) return;
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(`${campo} deve ser um número inteiro de minutos maior que zero.`);
  }
}

/**
 * Valida o expediente com o MESMO schema que o núcleo usa para lê-lo. O núcleo é
 * tolerante de propósito (JSON quebrado vira 24 por 7 em vez de derrubar o
 * roteamento de todas as filas); a ESCRITA não pode ser: gravar um expediente
 * ilegível é entregar ao tenant uma fila que ele acha que fecha às 18h e que na
 * prática promete prazo de madrugada.
 */
function validarHorario(horarioJson: unknown): void {
  if (horarioJson === null || horarioJson === undefined) return;
  const lido = horarioFilaSchema.safeParse(horarioJson);
  if (!lido.success) {
    const problema = lido.error.issues[0];
    throw new Error(
      `Expediente da fila inválido: ${problema?.message ?? "formato não reconhecido"} ` +
        `(${problema?.path.join(".") ?? "horarioJson"}).`,
    );
  }
}

function validarDados(dados: Partial<DadosDaFila>): void {
  validarPrazo(dados.prazoPrimeiraRespostaMin, "Prazo de primeira resposta");
  validarPrazo(dados.prazoResolucaoMin, "Prazo de resolução");
  validarHorario(dados.horarioJson);
  if (dados.ordem !== undefined && (!Number.isInteger(dados.ordem) || dados.ordem < 0)) {
    throw new Error("A ordem da fila deve ser um inteiro maior ou igual a zero.");
  }
}

/** P2002 do `@@unique([empresaId, nome])` vira mensagem de gente, não código do Prisma. */
function traduzirNomeDuplicado(erro: unknown, nome: string): never {
  if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
    throw new Error(`Já existe uma fila chamada "${nome}" nesta empresa.`);
  }
  throw erro;
}

/**
 * Filas do tenant, na ordem em que a entrada as percorre.
 *
 * Só as ATIVAS por padrão: quem lista para rotear, para o seletor da inbox ou
 * para o composer não pode receber fila arquivada. A tela de configuração pede
 * `{ incluirArquivadas: true }` explicitamente.
 */
export async function listarFilas(
  opcoes: { incluirArquivadas?: boolean } = {},
): Promise<FilaDetalhada[]> {
  const filas = await prisma.fila.findMany({
    where: opcoes.incluirArquivadas === true ? {} : { ativa: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: SELECT_FILA,
  });
  return filas.map(montarFila);
}

/**
 * Cria a fila. Sem `ordem` explícita, a nova fila entra no FIM — e não empatada
 * em zero com as existentes: a entrada usa "fila ativa de menor ordem", e empate
 * transformaria essa escolha no desempate do banco, que muda sem avisar.
 */
export async function criarFila(dados: DadosDaFila): Promise<FilaDetalhada> {
  const nome = exigirTexto(dados.nome, "O nome da fila");
  validarDados(dados);

  const ordem =
    dados.ordem ?? ((await prisma.fila.aggregate({ _max: { ordem: true } }))._max.ordem ?? 0) + 1;

  try {
    const fila = await prisma.fila.create({
      data: {
        nome,
        descricao: dados.descricao ?? null,
        prazoPrimeiraRespostaMin: dados.prazoPrimeiraRespostaMin ?? null,
        prazoResolucaoMin: dados.prazoResolucaoMin ?? null,
        distribuicao: dados.distribuicao ?? "manual",
        horarioJson: (dados.horarioJson ?? null) as Prisma.InputJsonValue,
        mensagemForaHorario: dados.mensagemForaHorario ?? null,
        ativa: dados.ativa ?? true,
        ordem,
      } as never,
      select: SELECT_FILA,
    });
    return montarFila(fila);
  } catch (erro) {
    return traduzirNomeDuplicado(erro, nome);
  }
}

/**
 * Atualiza a fila. Campo ausente não é campo nulo: só o que veio no objeto é
 * escrito, para que a tela de prazo não apague o expediente sem querer.
 *
 * Mudar `prazoPrimeiraRespostaMin` NÃO reescreve o prazo de conversa em
 * andamento — o compromisso já está gravado em `Conversa.prazoPrimeiraRespostaEm`
 * (ver `rotearConversa`).
 */
export async function atualizarFila(id: string, dados: Partial<DadosDaFila>): Promise<FilaDetalhada> {
  validarDados(dados);
  const nome = dados.nome === undefined ? undefined : exigirTexto(dados.nome, "O nome da fila");

  const existente = await prisma.fila.findFirst({ where: { id }, select: { id: true } });
  if (!existente) throw new Error("Fila não encontrada nesta empresa.");

  const data: Prisma.FilaUpdateInput = {};
  if (nome !== undefined) data.nome = nome;
  if (dados.descricao !== undefined) data.descricao = dados.descricao;
  if (dados.prazoPrimeiraRespostaMin !== undefined) {
    data.prazoPrimeiraRespostaMin = dados.prazoPrimeiraRespostaMin;
  }
  if (dados.prazoResolucaoMin !== undefined) data.prazoResolucaoMin = dados.prazoResolucaoMin;
  if (dados.distribuicao !== undefined) data.distribuicao = dados.distribuicao;
  if (dados.horarioJson !== undefined) {
    data.horarioJson = (dados.horarioJson ?? Prisma.DbNull) as Prisma.InputJsonValue;
  }
  if (dados.mensagemForaHorario !== undefined) data.mensagemForaHorario = dados.mensagemForaHorario;
  if (dados.ordem !== undefined) data.ordem = dados.ordem;
  if (dados.ativa !== undefined) data.ativa = dados.ativa;

  try {
    const fila = await prisma.fila.update({ where: { id }, data, select: SELECT_FILA });
    return montarFila(fila);
  } catch (erro) {
    return traduzirNomeDuplicado(erro, nome ?? "");
  }
}

/**
 * Arquiva a fila (`ativa = false`). NÃO apaga e NÃO move conversa: a fila
 * arquivada some da ENTRADA (roteamento e seletores), mas as conversas que ela
 * atendeu continuam apontando para ela, senão o relatório do mês passado muda de
 * resposta toda vez que alguém reorganiza a operação.
 */
export async function arquivarFila(id: string): Promise<FilaDetalhada> {
  const existente = await prisma.fila.findFirst({ where: { id }, select: { id: true } });
  if (!existente) throw new Error("Fila não encontrada nesta empresa.");
  const fila = await prisma.fila.update({
    where: { id },
    data: { ativa: false },
    select: SELECT_FILA,
  });
  return montarFila(fila);
}

async function membrosDaFila(filaId: string): Promise<MembroDaFila[]> {
  const membros = await prisma.membroFila.findMany({
    where: { filaId },
    select: { usuarioId: true, ativo: true, usuario: { select: { nome: true, email: true } } },
    orderBy: { usuario: { nome: "asc" } },
  });
  return membros.map((m) => ({
    usuarioId: m.usuarioId,
    nome: m.usuario.nome,
    email: m.usuario.email,
    ativo: m.ativo,
  }));
}

/**
 * Define quem atende a fila (lista completa, não incremental).
 *
 * Quem sai vira `ativo = false` em vez de ser apagado: `MembroFila` é o registro
 * de quem PODIA receber, e conversa antiga atribuída a alguém que saiu da fila
 * precisa continuar explicável. Quem volta reativa a mesma linha — o `@@unique
 * ([filaId, usuarioId])` garante que não existem duas.
 *
 * Usuário sem vínculo ATIVO com a empresa é recusado: atribuir conversa a quem
 * saiu do time é conversa que ninguém vê.
 */
export async function definirMembrosDaFila(
  filaId: string,
  usuarioIds: readonly string[],
): Promise<MembroDaFila[]> {
  const fila = await prisma.fila.findFirst({ where: { id: filaId }, select: { id: true } });
  if (!fila) throw new Error("Fila não encontrada nesta empresa.");

  const ids = [...new Set(usuarioIds)];
  if (ids.length > 0) {
    const vinculos = await prisma.vinculoUsuarioEmpresa.findMany({
      where: { usuarioId: { in: ids }, ativo: true },
      select: { usuarioId: true },
    });
    const comVinculo = new Set(vinculos.map((v) => v.usuarioId));
    const invalidos = ids.filter((id) => !comVinculo.has(id));
    if (invalidos.length > 0) {
      throw new Error(
        `Usuário sem vínculo ativo com esta empresa não pode entrar na fila: ${invalidos.join(", ")}.`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    // `notIn: []` não é uniforme entre versões do Prisma — quando a lista é
    // vazia, "desativar todo mundo" se escreve sem o notIn.
    await tx.membroFila.updateMany({
      where: { filaId, ativo: true, ...(ids.length > 0 ? { usuarioId: { notIn: ids } } : {}) },
      data: { ativo: false },
    });

    if (ids.length > 0) {
      await tx.membroFila.updateMany({
        where: { filaId, usuarioId: { in: ids }, ativo: false },
        data: { ativo: true },
      });
      const existentes = await tx.membroFila.findMany({
        where: { filaId, usuarioId: { in: ids } },
        select: { usuarioId: true },
      });
      const jaMembros = new Set(existentes.map((m) => m.usuarioId));
      const novos = ids.filter((id) => !jaMembros.has(id));
      if (novos.length > 0) {
        await tx.membroFila.createMany({
          data: novos.map((usuarioId) => ({ filaId, usuarioId })) as never,
        });
      }
    }
  });

  return membrosDaFila(filaId);
}

// ─────────────────────────────────────────────────────────────
// Ciclo de vida da conversa
// ─────────────────────────────────────────────────────────────

export interface ResultadoRoteamento {
  filaId: string;
  /** `null` = ninguém recebeu automaticamente; a conversa espera alguém assumir. */
  atendenteId: string | null;
  prazo: Date | null;
}

/**
 * Conversas ABERTAS por atendente, em UMA consulta agregada.
 *
 * É o `conversasAbertas` de `MembroParaRoteamento`. A carga é do ATENDENTE e não
 * da fila: a pessoa é uma só, e distribuir por carga olhando só a fila atual
 * entregaria mais conversa para quem já está afogado em outra.
 */
async function cargaPorAtendente(usuarioIds: readonly string[]): Promise<Map<string, number>> {
  if (usuarioIds.length === 0) return new Map();
  const linhas = await prisma.conversa.groupBy({
    by: ["atendenteUsuarioId"],
    where: {
      deletedAt: null,
      encerradaEm: null,
      estado: { not: "encerrada" },
      atendenteUsuarioId: { in: [...usuarioIds] },
    },
    _count: { _all: true },
  });
  const mapa = new Map<string, number>();
  for (const linha of linhas) {
    if (linha.atendenteUsuarioId !== null) mapa.set(linha.atendenteUsuarioId, linha._count._all);
  }
  return mapa;
}

/**
 * Roteia a conversa: escolhe a fila, monta o `FilaParaRoteamento` a partir do
 * banco, chama o núcleo e grava `filaId`, `atendenteUsuarioId` e
 * `prazoPrimeiraRespostaEm`.
 *
 * Quatro decisões que valem o comentário:
 *
 * 1. **Escolha da FILA**: a conversa que já tem fila fica nela; a que não tem cai
 *    na fila ativa de MENOR `ordem`. A regra declarativa de entrada (por canal,
 *    por palavra-chave, por horário) é evolução prevista do E1 e vai substituir
 *    exatamente este trecho — não há regra implícita escondida aqui.
 * 2. **Dono não é roubado**: conversa que já tem atendente mantém o atendente. A
 *    reatribuição existe e tem nome — `devolverParaFila` e depois rotear de novo.
 * 3. **Prazo não é recalculado**: se `prazoPrimeiraRespostaEm` já está gravado, o
 *    compromisso com o cliente vale como estava. Rotear de novo (ou o gerente
 *    mexer no prazo da fila) não pode dar mais tempo a quem já estava devendo.
 * 4. **Estado não é tocado**: quem move a conversa entre motores é a máquina de
 *    estados do motor. O roteador que mudasse `estado` tiraria do bot uma
 *    conversa que ainda está no meio da árvore.
 */
export async function rotearConversa(
  conversaId: string,
  agora: Date = new Date(),
): Promise<ResultadoRoteamento> {
  const conversa = await prisma.conversa.findFirst({
    where: { id: conversaId, deletedAt: null },
    select: {
      id: true,
      filaId: true,
      atendenteUsuarioId: true,
      prazoPrimeiraRespostaEm: true,
      cliente: { select: { vendedorId: true } },
    },
  });
  if (!conversa) throw new Error("Conversa não encontrada nesta empresa.");

  const fila =
    conversa.filaId !== null
      ? await prisma.fila.findFirst({ where: { id: conversa.filaId } })
      : await prisma.fila.findFirst({
          where: { ativa: true },
          orderBy: [{ ordem: "asc" }, { nome: "asc" }],
        });
  if (!fila) {
    throw new Error(
      "Nenhuma fila ativa configurada — crie uma fila antes de rotear conversas para atendimento.",
    );
  }

  // Membro da fila que perdeu o vínculo com a empresa continua na tabela (é
  // histórico), mas não pode receber conversa nova: o `ativo` que vai para o
  // núcleo é o E lógico dos dois.
  const membrosCru = await prisma.membroFila.findMany({
    where: { filaId: fila.id },
    // Ordem estável e independente de inserção — é ela que o rodízio percorre.
    orderBy: { usuarioId: "asc" },
    select: { usuarioId: true, ativo: true },
  });
  const idsMembros = membrosCru.map((m) => m.usuarioId);
  const vinculados =
    idsMembros.length > 0
      ? new Set(
          (
            await prisma.vinculoUsuarioEmpresa.findMany({
              where: { usuarioId: { in: idsMembros }, ativo: true },
              select: { usuarioId: true },
            })
          ).map((v) => v.usuarioId),
        )
      : new Set<string>();

  const distribuicao: Distribuicao = fila.distribuicao;
  // Carga e ponteiro do rodízio custam uma consulta cada — só as busca a
  // distribuição que de fato as usa (o inbound roda a cada mensagem).
  const carga =
    distribuicao === "carga" ? await cargaPorAtendente(idsMembros) : new Map<string, number>();

  const ultimo =
    distribuicao === "rodizio" || distribuicao === "carteira"
      ? await prisma.conversa.findFirst({
          where: { filaId: fila.id, atendenteUsuarioId: { not: null }, id: { not: conversaId } },
          orderBy: { criadoEm: "desc" },
          select: { atendenteUsuarioId: true },
        })
      : null;

  const membros: MembroParaRoteamento[] = membrosCru.map((m) => ({
    usuarioId: m.usuarioId,
    ativo: m.ativo && vinculados.has(m.usuarioId),
    conversasAbertas: carga.get(m.usuarioId) ?? 0,
  }));

  const filaParaRoteamento: FilaParaRoteamento = {
    id: fila.id,
    distribuicao,
    prazoPrimeiraRespostaMin: fila.prazoPrimeiraRespostaMin,
    horarioJson: fila.horarioJson,
    membros,
  };

  const escolhido =
    conversa.atendenteUsuarioId ??
    escolherAtendente(filaParaRoteamento, {
      vendedorIdDoCliente: conversa.cliente.vendedorId ?? undefined,
      ultimoAtendenteId: ultimo?.atendenteUsuarioId ?? undefined,
    });

  const prazo =
    conversa.prazoPrimeiraRespostaEm ?? calcularPrazoPrimeiraResposta(agora, filaParaRoteamento);

  await prisma.conversa.update({
    where: { id: conversaId },
    data: {
      filaId: fila.id,
      atendenteUsuarioId: escolhido,
      prazoPrimeiraRespostaEm: prazo,
    },
  });

  return { filaId: fila.id, atendenteId: escolhido, prazo };
}

async function diagnosticarConversa(conversaId: string, acao: string): Promise<never> {
  const conversa = await prisma.conversa.findFirst({
    where: { id: conversaId },
    select: { deletedAt: true, encerradaEm: true, estado: true, atendenteUsuarioId: true },
  });
  if (!conversa || conversa.deletedAt !== null) {
    throw new Error("Conversa não encontrada nesta empresa.");
  }
  if (conversa.encerradaEm !== null || conversa.estado === "encerrada") {
    throw new Error(`Conversa já encerrada — não é possível ${acao}.`);
  }
  if (conversa.atendenteUsuarioId !== null) {
    throw new Error("Conversa já está com outro atendente — peça para ele devolver para a fila.");
  }
  throw new Error(`Não foi possível ${acao} esta conversa.`);
}

/**
 * Atendente assume a conversa.
 *
 * O `updateMany` condicional é o que faz a arbitragem: dois atendentes clicando
 * ao mesmo tempo na mesma conversa da fila é o caso NORMAL do painel, e ler para
 * depois escrever deixaria o segundo sobrescrever o primeiro sem ninguém notar.
 * Quem perde a corrida recebe `count = 0` e uma mensagem que explica.
 * Reassumir a própria conversa é idempotente.
 */
export async function assumirConversa(conversaId: string, usuarioId: string): Promise<void> {
  const vinculo = await prisma.vinculoUsuarioEmpresa.findFirst({
    where: { usuarioId, ativo: true },
    select: { id: true },
  });
  if (!vinculo) throw new Error("Usuário sem vínculo ativo com esta empresa.");

  const r = await prisma.conversa.updateMany({
    where: {
      id: conversaId,
      deletedAt: null,
      encerradaEm: null,
      estado: { not: "encerrada" },
      OR: [{ atendenteUsuarioId: null }, { atendenteUsuarioId: usuarioId }],
    },
    data: { atendenteUsuarioId: usuarioId, estado: "humano" },
  });
  if (r.count === 0) await diagnosticarConversa(conversaId, "assumir");
}

/**
 * Devolve a conversa para a fila: solta o dono e volta o estado para
 * `fila_humano`. A fila e o PRAZO permanecem — devolver não zera o relógio do
 * cliente, senão passar a conversa de mão em mão limparia o atraso.
 */
export async function devolverParaFila(conversaId: string): Promise<void> {
  const r = await prisma.conversa.updateMany({
    where: { id: conversaId, deletedAt: null, encerradaEm: null, estado: { not: "encerrada" } },
    data: { atendenteUsuarioId: null, estado: "fila_humano" },
  });
  if (r.count === 0) await diagnosticarConversa(conversaId, "devolver para a fila");
}

/**
 * Encerra a conversa. O motivo é OBRIGATÓRIO e precisa ser do próprio tenant:
 * é ele que transforma a inbox em relatório de demanda — sem motivo, no mês
 * seguinte ninguém sabe por que as conversas terminaram.
 *
 * Reencerrar não é permitido: `encerradaEm` é o instante que o relatório usa e
 * não pode ser reescrito por um clique repetido. Corrigir o motivo de uma
 * conversa já encerrada é outra operação (auditada), não um encerramento novo.
 */
export async function encerrarConversa(
  conversaId: string,
  motivoEncerramentoId: string,
  quando: Date = new Date(),
): Promise<void> {
  // A extension confina o findFirst ao tenant: motivo de OUTRA empresa não é
  // achado e cai na mesma mensagem de motivo inválido (regra inviolável 1).
  const motivo = await prisma.motivoEncerramento.findFirst({
    where: { id: motivoEncerramentoId },
    select: { id: true, nome: true, ativo: true },
  });
  if (!motivo) {
    throw new Error(
      "Motivo de encerramento inválido para esta empresa — escolha um motivo da lista do seu time.",
    );
  }
  if (!motivo.ativo) {
    throw new Error(`O motivo "${motivo.nome}" está desativado — escolha um motivo ativo.`);
  }

  const r = await prisma.conversa.updateMany({
    where: { id: conversaId, deletedAt: null, encerradaEm: null, estado: { not: "encerrada" } },
    data: { estado: "encerrada", encerradaEm: quando, motivoEncerramentoId: motivo.id },
  });
  if (r.count === 0) await diagnosticarConversa(conversaId, "encerrar");
}

export interface ResultadoPrimeiraResposta {
  /** `false` = já havia primeira resposta; nada foi reescrito. */
  gravou: boolean;
  primeiraRespostaEm: Date;
}

/**
 * Marca a primeira resposta da conversa — o instante que o painel de prazo usa.
 *
 * IDEMPOTENTE E SEM RETROCESSO: o `where` exige `primeiraRespostaEm: null`, então
 * a segunda chamada não escreve nada. É o banco decidindo, não um `if` na
 * aplicação: recibo atrasado do provedor, reentrega de webhook e reenvio da
 * mesma mensagem chegam fora de ordem e concorrentes, e qualquer um deles
 * reescrevendo o instante mudaria o SLA já cumprido.
 */
export async function registrarPrimeiraResposta(
  conversaId: string,
  quando: Date,
): Promise<ResultadoPrimeiraResposta> {
  const r = await prisma.conversa.updateMany({
    where: { id: conversaId, deletedAt: null, primeiraRespostaEm: null },
    data: { primeiraRespostaEm: quando },
  });
  if (r.count > 0) return { gravou: true, primeiraRespostaEm: quando };

  const atual = await prisma.conversa.findFirst({
    where: { id: conversaId, deletedAt: null },
    select: { primeiraRespostaEm: true },
  });
  if (!atual) throw new Error("Conversa não encontrada nesta empresa.");
  // Chegou aqui com nulo só se a linha sumiu entre as duas consultas; tratar como
  // gravação não feita é melhor do que inventar um instante.
  if (atual.primeiraRespostaEm === null) {
    throw new Error("Não foi possível registrar a primeira resposta desta conversa.");
  }
  return { gravou: false, primeiraRespostaEm: atual.primeiraRespostaEm };
}

// ─────────────────────────────────────────────────────────────
// Inbox
// ─────────────────────────────────────────────────────────────

export interface FiltroInbox {
  filaId?: string;
  estado?: EstadoConversa;
  /** `null` filtra explicitamente as conversas SEM dono (as que esperam na fila). */
  atendenteUsuarioId?: string | null;
  situacaoPrazo?: SituacaoPrazo;
  /** Instante de referência do cálculo de prazo — parâmetro para o teste poder mentir o relógio. */
  agora?: Date;
  limite?: number;
}

export interface ItemInbox {
  conversaId: string;
  estado: EstadoConversa;
  cliente: { id: string; nome: string; razaoSocial: string | null; telefone: string | null };
  canal: { id: string; nome: string; tipo: string };
  fila: { id: string; nome: string } | null;
  atendente: { id: string; nome: string } | null;
  ultimaMensagem: { texto: string | null; direcao: string; criadoEm: Date } | null;
  /** Entradas do cliente desde a última resposta — ver comentário em `listarInbox`. */
  naoLidas: number;
  primeiraRespostaEm: Date | null;
  prazoPrimeiraRespostaEm: Date | null;
  situacaoPrazo: SituacaoPrazo;
  /** Início da conversa. É o carimbo a exibir quando ainda não há mensagem. */
  criadoEm: Date;
  /**
   * Último toque na linha — é por ele que a inbox ORDENA, e o `inbound` toca a
   * conversa de propósito a cada mensagem para isso funcionar.
   *
   * Não serve para EXIBIR: assumir a conversa ou aplicar uma etiqueta também
   * reescreve o campo, e a linha passaria a anunciar "há 2 min" ao lado do
   * texto de uma mensagem de ontem.
   */
  atualizadoEm: Date;
}

/**
 * Pré-filtro de prazo em SQL. Cobre só o que o banco sabe responder sozinho; o
 * corte fino de `perto_do_estouro` (80% do prazo corrido) depende do
 * `prazoPrimeiraRespostaMin` da fila e é do núcleo.
 */
function prefiltroDePrazo(situacao: SituacaoPrazo | undefined, agora: Date): Prisma.ConversaWhereInput {
  switch (situacao) {
    case "cumprido":
      return { primeiraRespostaEm: { not: null } };
    case "sem_prazo":
      return { primeiraRespostaEm: null, prazoPrimeiraRespostaEm: null };
    case "estourado":
      return { primeiraRespostaEm: null, prazoPrimeiraRespostaEm: { lte: agora } };
    case "no_prazo":
    case "perto_do_estouro":
      return { primeiraRespostaEm: null, prazoPrimeiraRespostaEm: { gt: agora } };
    default:
      return {};
  }
}

/**
 * A inbox: uma linha por conversa, com o que o painel mostra e a situação do
 * prazo calculada pelo núcleo.
 *
 * Ordenação: por padrão, a conversa mexida mais recentemente primeiro. Com
 * filtro de PRAZO, o mais apertado primeiro (`prazoPrimeiraRespostaEm` crescente,
 * sem prazo por último) — o painel de prazo existe para responder "quem estoura
 * primeiro", e essa pergunta não se responde com ordenação por atividade.
 *
 * Sem filtro de estado, a inbox exclui as ENCERRADAS: é caixa de trabalho, não
 * histórico. Para ver histórico, filtre `estado: "encerrada"` de propósito.
 *
 * **Nunca N+1**: são cinco consultas para a página inteira, todas agregadas
 * (conversas, último instante por conversa, as mensagens desses instantes,
 * última saída por conversa, contagem de entradas posteriores).
 *
 * **"Não lidas"** é hoje uma aproximação declarada: o schema do E1 não tem
 * marcador de leitura, então a contagem é de mensagens de ENTRADA posteriores à
 * última mensagem de SAÍDA. Quando existir `lidaEm` (ou um model de leitura por
 * usuário), só a fonte deste número muda — o contrato desta função, não.
 */
export async function listarInbox(filtro: FiltroInbox = {}): Promise<ItemInbox[]> {
  const agora = filtro.agora ?? new Date();
  const limite = Math.min(Math.max(filtro.limite ?? LIMITE_PADRAO_INBOX, 1), LIMITE_MAXIMO_INBOX);
  const porPrazo = filtro.situacaoPrazo !== undefined;

  const conversas = await prisma.conversa.findMany({
    where: {
      deletedAt: null,
      ...(filtro.filaId !== undefined ? { filaId: filtro.filaId } : {}),
      ...(filtro.estado !== undefined ? { estado: filtro.estado } : { estado: { not: "encerrada" } }),
      ...(filtro.atendenteUsuarioId !== undefined
        ? { atendenteUsuarioId: filtro.atendenteUsuarioId }
        : {}),
      ...prefiltroDePrazo(filtro.situacaoPrazo, agora),
    },
    orderBy: porPrazo
      ? [{ prazoPrimeiraRespostaEm: { sort: "asc", nulls: "last" } }, { criadoEm: "asc" }]
      : [{ atualizadoEm: "desc" }],
    take: limite,
    select: {
      id: true,
      estado: true,
      criadoEm: true,
      atualizadoEm: true,
      primeiraRespostaEm: true,
      prazoPrimeiraRespostaEm: true,
      cliente: { select: { id: true, nome: true, razaoSocial: true, telefone: true } },
      canal: { select: { id: true, nome: true, tipo: true } },
      fila: { select: { id: true, nome: true, prazoPrimeiraRespostaMin: true } },
      atendente: { select: { id: true, nome: true } },
    },
  });
  if (conversas.length === 0) return [];

  const ids = conversas.map((c) => c.id);

  const [instantes, saidas] = await Promise.all([
    prisma.mensagem.groupBy({
      by: ["conversaId"],
      where: { conversaId: { in: ids }, deletedAt: null },
      _max: { criadoEm: true },
    }),
    prisma.mensagem.groupBy({
      by: ["conversaId"],
      where: { conversaId: { in: ids }, deletedAt: null, direcao: "saida" },
      _max: { criadoEm: true },
    }),
  ]);

  const pares = instantes
    .filter((i): i is typeof i & { _max: { criadoEm: Date } } => i._max.criadoEm !== null)
    .map((i) => ({ conversaId: i.conversaId, criadoEm: i._max.criadoEm }));

  const ultimaSaida = new Map<string, Date>();
  for (const s of saidas) {
    if (s._max.criadoEm !== null) ultimaSaida.set(s.conversaId, s._max.criadoEm);
  }

  const [mensagens, naoLidas] = await Promise.all([
    pares.length > 0
      ? prisma.mensagem.findMany({
          where: { OR: pares },
          select: { conversaId: true, texto: true, direcao: true, criadoEm: true },
        })
      : Promise.resolve([]),
    prisma.mensagem.groupBy({
      by: ["conversaId"],
      where: {
        // Um OR por conversa da PÁGINA — continua sendo uma consulta só, com o
        // corte "desde a última resposta" que varia por linha.
        OR: ids.map((id) => ({
          conversaId: id,
          direcao: "entrada" as const,
          deletedAt: null,
          criadoEm: { gt: ultimaSaida.get(id) ?? EPOCA },
        })),
      },
      _count: { _all: true },
    }),
  ]);

  const ultimaMensagem = new Map<string, { texto: string | null; direcao: string; criadoEm: Date }>();
  for (const m of mensagens) {
    // Empate de timestamp (duas mensagens no mesmo milissegundo) fica com a
    // primeira lida — o painel mostra o texto, não arbitra ordem de chegada.
    if (!ultimaMensagem.has(m.conversaId)) {
      ultimaMensagem.set(m.conversaId, { texto: m.texto, direcao: m.direcao, criadoEm: m.criadoEm });
    }
  }
  const contagem = new Map(naoLidas.map((n) => [n.conversaId, n._count._all]));

  const itens: ItemInbox[] = conversas.map((c) => ({
    conversaId: c.id,
    estado: c.estado,
    cliente: c.cliente,
    canal: c.canal,
    fila: c.fila === null ? null : { id: c.fila.id, nome: c.fila.nome },
    atendente: c.atendente,
    ultimaMensagem: ultimaMensagem.get(c.id) ?? null,
    naoLidas: contagem.get(c.id) ?? 0,
    primeiraRespostaEm: c.primeiraRespostaEm,
    prazoPrimeiraRespostaEm: c.prazoPrimeiraRespostaEm,
    situacaoPrazo: situacaoDoPrazo(
      agora,
      c.prazoPrimeiraRespostaEm,
      c.primeiraRespostaEm,
      c.fila?.prazoPrimeiraRespostaMin,
    ),
    criadoEm: c.criadoEm,
    atualizadoEm: c.atualizadoEm,
  }));

  // O corte fino fica aqui porque só o núcleo sabe a fronteira dos 80%; o
  // pré-filtro do banco já garantiu que a página só trouxe candidatos.
  return filtro.situacaoPrazo === undefined
    ? itens
    : itens.filter((i) => i.situacaoPrazo === filtro.situacaoPrazo);
}
