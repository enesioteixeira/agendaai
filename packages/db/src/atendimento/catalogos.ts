// Catálogos que o tenant configura para operar a inbox (E1 — doc 05): motivos
// de encerramento, etiquetas de conversa, respostas rápidas e notas internas.
// Tudo roda sob a extension de tenancy (regra inviolável 1) — nenhuma função
// daqui escreve `where: { empresaId }` à mão.
//
// Três decisões atravessam o módulo inteiro:
//
// 1. ARQUIVAR, NUNCA APAGAR. Motivo e etiqueta são a taxonomia dos relatórios.
//    Apagar um motivo já usado em conversa encerrada não some com uma linha de
//    configuração: some com a explicação de por que 300 conversas do mês
//    passado terminaram, e o fechamento do mês deixa de bater. Por isso o
//    "excluir" da interface chama `arquivar*`, que só desliga `ativo`/`ativa`;
//    a FK continua resolvendo o nome no histórico. Não existe delete aqui.
//
// 2. NOTA INTERNA NUNCA VAI PARA O CLIENTE. `NotaConversa` é uma tabela
//    própria, separada de `Mensagem` de propósito: só entra no canal o que
//    passa pelo envio (mensagemOutboundSchema → job de envio), e nota não tem
//    caminho até lá. A garantia real está em quem envia, não aqui — o que este
//    módulo garante, e o e2e prova, é que gravar nota NÃO cria Mensagem.
//    Quem for mexer no composer: nota é campo separado, nunca "mensagem com
//    flag interna" — flag é uma linha de código longe de vazar para o cliente.
//
// 3. ID VINDO DE FORA É CONFERIDO CONTRA O TENANT ANTES DE VIRAR FK. A
//    extension confina `where` e carimba `empresaId` na linha nova, mas uma FK
//    (conversaId, etiquetaId, filaId, autorUsuarioId) aponta para a chave
//    primária e não checa empresa: criar `ConversaEtiqueta` com a etiqueta do
//    tenant A na conversa do tenant B geraria uma linha carimbada com o tenant
//    certo apontando para dado alheio. Cada FK é resolvida por uma leitura sob
//    o tenant antes da escrita — mesmo cuidado do `papelId` em `criarConvite`.
//
// Onde vivem os schemas: a regra 14 põe os contratos Zod em `@atende/core`, que
// é o contrato entre `apps/web` e `apps/worker`. Os schemas daqui validam a
// borda DESTA camada (o que a server action entrega ao banco) e ainda não
// cruzam processo, então nascem locais; quando o composer do worker precisar do
// mesmo `atalho` normalizado, eles se mudam para
// `@atende/core/atendimento/filas` sem mudar o comportamento.

import { z } from "zod";
import { prisma, Prisma } from "../client";
import { contextoTenantAtual } from "../tenancy";

// ─────────────────────────────────────────────────────────────
// Validação de borda
// ─────────────────────────────────────────────────────────────

/** Nome de item de catálogo: aparece em filtro e relatório, então trim e teto. */
const nomeDeCatalogoSchema = z
  .string()
  .trim()
  .min(1, "Informe um nome.")
  .max(60, "Nome muito longo (máx. 60 caracteres).");

const textoDeNotaSchema = z
  .string()
  .trim()
  .min(1, "A nota está vazia.")
  .max(5000, "Nota muito longa (máx. 5 000 caracteres).");

const tituloDeRespostaSchema = z
  .string()
  .trim()
  .min(1, "Informe um título.")
  .max(80, "Título muito longo (máx. 80 caracteres).");

const textoDeRespostaSchema = z
  .string()
  .trim()
  .min(1, "A resposta está vazia.")
  .max(4000, "Resposta muito longa (máx. 4 000 caracteres).");

/**
 * Forma canônica do atalho de resposta rápida.
 *
 * O atendente digita `/prazo` no composer e o cadastro é feito por outra pessoa,
 * em outro dia, com outra ideia de maiúscula. "/Prazo", "prazo " e "prazo"
 * precisam ser a MESMA entrada, senão o unique `(empresaId, atalho)` deixa
 * passar três linhas que a digitação não sabe distinguir e o composer escolhe
 * uma delas por acaso.
 *
 * Regras, e o porquê de cada uma:
 * - **sem a barra inicial**: a barra é o gatilho do composer, não parte do nome;
 * - **sem espaço**: o composer termina o atalho no primeiro espaço, então um
 *   atalho com espaço seria impossível de invocar — remover é mais gentil que
 *   recusar depois de a pessoa ter escrito;
 * - **sem acento**: `/Endereço` e `/endereco` são a mesma intenção, e teclado de
 *   celular erra acento o tempo todo. Também é a convenção do repositório para
 *   nome de domínio (regra 17);
 * - **minúsculo**: idem.
 *
 * Exportada porque o LADO DA LEITURA precisa da mesma função: o composer
 * normaliza o que foi digitado antes de procurar, ou a busca não acha o que o
 * cadastro gravou.
 */
export function normalizarAtalho(bruto: string): string {
  return bruto
    .normalize("NFD") // separa a letra do acento…
    .replace(/\p{M}/gu, "") // …e descarta a marca de acento solta
    .replace(/\s+/g, "")
    .replace(/^\/+/, "")
    .toLowerCase();
}

/** Aceita o atalho como a pessoa digitou e devolve a forma canônica. */
export const atalhoRespostaRapidaSchema = z
  .string()
  .transform(normalizarAtalho)
  .pipe(
    z
      .string()
      .min(1, "Informe um atalho (ex.: /prazo).")
      .max(32, "Atalho muito longo (máx. 32 caracteres).")
      .regex(
        /^[a-z0-9][a-z0-9._-]*$/,
        "O atalho aceita letras, números, ponto, hífen e sublinhado, e começa por letra ou número.",
      ),
  );

// ─────────────────────────────────────────────────────────────
// Tipos de saída
// ─────────────────────────────────────────────────────────────

export interface MotivoDeEncerramento {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

export interface EtiquetaDeConversa {
  id: string;
  nome: string;
  cor: string | null;
  ativa: boolean;
}

export interface AplicacaoDeEtiqueta {
  conversaId: string;
  etiquetaId: string;
  /** true quando a etiqueta já estava aplicada — a operação é idempotente. */
  jaEstava: boolean;
}

export interface RespostaRapidaResumo {
  id: string;
  atalho: string;
  titulo: string;
  texto: string;
  /** null = vale para a empresa toda. */
  filaId: string | null;
  ativa: boolean;
}

export interface NotaDeConversa {
  id: string;
  conversaId: string;
  texto: string;
  autorUsuarioId: string;
  autorNome: string;
  criadoEm: Date;
}

const CAMPOS_MOTIVO = { id: true, nome: true, ativo: true, ordem: true } as const;
const CAMPOS_ETIQUETA = { id: true, nome: true, cor: true, ativa: true } as const;
const CAMPOS_RESPOSTA = {
  id: true,
  atalho: true,
  titulo: true,
  texto: true,
  filaId: true,
  ativa: true,
} as const;

// ─────────────────────────────────────────────────────────────
// Auxiliares
// ─────────────────────────────────────────────────────────────

/** Violação de unicidade — a do Prisma e a crua do Postgres (raw/adapter). */
function ehConflitoDeUnicidade(erro: unknown): boolean {
  if (erro instanceof Prisma.PrismaClientKnownRequestError) return erro.code === "P2002";
  return typeof erro === "object" && erro !== null && (erro as { code?: string }).code === "23505";
}

/**
 * Confere que a conversa é DESTE tenant antes de qualquer FK apontar para ela
 * (decisão 3 do topo). Conversa soft-deletada não aceita etiqueta nem nota:
 * a inbox não a mostra mais, e escrever nela seria gravar em lugar invisível.
 */
async function exigirConversaDoTenant(conversaId: string): Promise<string> {
  const conversa = await prisma.conversa.findFirst({
    where: { id: conversaId, deletedAt: null },
    select: { id: true },
  });
  if (!conversa) throw new Error("Conversa não encontrada nesta empresa.");
  return conversa.id;
}

/** Idem para a fila que restringe uma resposta rápida. */
async function exigirFilaDoTenant(filaId: string): Promise<string> {
  const fila = await prisma.fila.findFirst({ where: { id: filaId }, select: { id: true } });
  if (!fila) throw new Error("Fila não encontrada nesta empresa.");
  return fila.id;
}

// ─────────────────────────────────────────────────────────────
// Motivos de encerramento
// ─────────────────────────────────────────────────────────────

/**
 * Motivos ativos, na ordem que o tenant definiu.
 *
 * `incluirArquivados` existe para o RELATÓRIO: a tela de encerramento só pode
 * oferecer motivo vivo, mas o filtro do relatório do mês passado precisa listar
 * os motivos que estavam em uso naquele mês, inclusive os já arquivados.
 */
export async function listarMotivosEncerramento(opcoes?: {
  incluirArquivados?: boolean;
}): Promise<MotivoDeEncerramento[]> {
  return prisma.motivoEncerramento.findMany({
    where: opcoes?.incluirArquivados ? {} : { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: CAMPOS_MOTIVO,
  });
}

async function reativarMotivo(motivo: MotivoDeEncerramento): Promise<MotivoDeEncerramento> {
  if (motivo.ativo) return motivo;
  const [reativado] = await prisma.motivoEncerramento.updateManyAndReturn({
    where: { id: motivo.id },
    data: { ativo: true },
    select: CAMPOS_MOTIVO,
  });
  return reativado ?? { ...motivo, ativo: true };
}

/**
 * Cria o motivo — ou RESSUSCITA o de mesmo nome que estava arquivado.
 *
 * Sem isso, quem arquivou "Sem estoque" em janeiro e tenta recriá-lo em março
 * bate no unique `(empresaId, nome)` e recebe um erro de banco por ter feito
 * exatamente o que a interface mandou. Reativar preserva de quebra o vínculo
 * das conversas antigas: o relatório continua contando a mesma linha.
 */
export async function criarMotivoEncerramento(nome: string): Promise<MotivoDeEncerramento> {
  const { empresaId } = contextoTenantAtual();
  const nomeLimpo = nomeDeCatalogoSchema.parse(nome);

  const existente = await prisma.motivoEncerramento.findFirst({
    where: { nome: nomeLimpo },
    select: CAMPOS_MOTIVO,
  });
  if (existente) return reativarMotivo(existente);

  const agregado = await prisma.motivoEncerramento.aggregate({ _max: { ordem: true } });
  const ordem = (agregado._max.ordem ?? 0) + 1;

  try {
    return await prisma.motivoEncerramento.create({
      data: { empresaId, nome: nomeLimpo, ordem },
      select: CAMPOS_MOTIVO,
    });
  } catch (erro) {
    if (!ehConflitoDeUnicidade(erro)) throw erro;
    // Corrida: outra aba criou o mesmo nome entre a leitura e a escrita.
    const criadoPorOutro = await prisma.motivoEncerramento.findFirstOrThrow({
      where: { nome: nomeLimpo },
      select: CAMPOS_MOTIVO,
    });
    return reativarMotivo(criadoPorOutro);
  }
}

/**
 * Tira o motivo do menu de encerramento SEM apagá-lo (decisão 1 do topo).
 * As conversas já encerradas com ele continuam apontando para a mesma linha.
 */
export async function arquivarMotivoEncerramento(id: string): Promise<MotivoDeEncerramento> {
  const [motivo] = await prisma.motivoEncerramento.updateManyAndReturn({
    where: { id },
    data: { ativo: false },
    select: CAMPOS_MOTIVO,
  });
  if (!motivo) throw new Error("Motivo de encerramento não encontrado nesta empresa.");
  return motivo;
}

// ─────────────────────────────────────────────────────────────
// Etiquetas de conversa
// ─────────────────────────────────────────────────────────────

export async function listarEtiquetas(opcoes?: {
  incluirArquivadas?: boolean;
}): Promise<EtiquetaDeConversa[]> {
  return prisma.etiquetaConversa.findMany({
    where: opcoes?.incluirArquivadas ? {} : { ativa: true },
    orderBy: { nome: "asc" },
    select: CAMPOS_ETIQUETA,
  });
}

async function reativarEtiqueta(
  etiqueta: EtiquetaDeConversa,
  cor: string | null | undefined,
): Promise<EtiquetaDeConversa> {
  const precisaCor = cor !== undefined && cor !== etiqueta.cor;
  if (etiqueta.ativa && !precisaCor) return etiqueta;
  const [reativada] = await prisma.etiquetaConversa.updateManyAndReturn({
    where: { id: etiqueta.id },
    data: precisaCor ? { ativa: true, cor } : { ativa: true },
    select: CAMPOS_ETIQUETA,
  });
  return reativada ?? { ...etiqueta, ativa: true };
}

/** Cria a etiqueta, ou reativa a arquivada de mesmo nome (ver `criarMotivoEncerramento`). */
export async function criarEtiqueta(dados: {
  nome: string;
  cor?: string | null;
}): Promise<EtiquetaDeConversa> {
  const { empresaId } = contextoTenantAtual();
  const nomeLimpo = nomeDeCatalogoSchema.parse(dados.nome);
  // `cor` é token do design system ("verde-500"), não hex cru — o schema do
  // banco documenta isso e a interface é quem oferece a paleta.
  const cor = dados.cor === undefined ? undefined : (dados.cor?.trim() || null);

  const existente = await prisma.etiquetaConversa.findFirst({
    where: { nome: nomeLimpo },
    select: CAMPOS_ETIQUETA,
  });
  if (existente) return reativarEtiqueta(existente, cor);

  try {
    return await prisma.etiquetaConversa.create({
      data: { empresaId, nome: nomeLimpo, cor: cor ?? null },
      select: CAMPOS_ETIQUETA,
    });
  } catch (erro) {
    if (!ehConflitoDeUnicidade(erro)) throw erro;
    const criadaPorOutro = await prisma.etiquetaConversa.findFirstOrThrow({
      where: { nome: nomeLimpo },
      select: CAMPOS_ETIQUETA,
    });
    return reativarEtiqueta(criadaPorOutro, cor);
  }
}

/**
 * Arquiva a etiqueta. As aplicações existentes (`ConversaEtiqueta`) PERMANECEM:
 * o filtro do histórico continua achando as conversas que a receberam; só não
 * é possível aplicá-la em conversa nova.
 */
export async function arquivarEtiqueta(id: string): Promise<EtiquetaDeConversa> {
  const [etiqueta] = await prisma.etiquetaConversa.updateManyAndReturn({
    where: { id },
    data: { ativa: false },
    select: CAMPOS_ETIQUETA,
  });
  if (!etiqueta) throw new Error("Etiqueta não encontrada nesta empresa.");
  return etiqueta;
}

/**
 * Aplica a etiqueta na conversa. IDEMPOTENTE: clicar duas vezes (ou dois
 * atendentes clicando junto) devolve sucesso, não um erro de unique na cara de
 * quem está no meio de um atendimento. O `@@unique([conversaId, etiquetaId])`
 * é quem garante a ausência de duplicata; aqui só traduzimos o conflito.
 */
export async function aplicarEtiqueta(
  conversaId: string,
  etiquetaId: string,
): Promise<AplicacaoDeEtiqueta> {
  const { empresaId } = contextoTenantAtual();
  await exigirConversaDoTenant(conversaId);

  const etiqueta = await prisma.etiquetaConversa.findFirst({
    where: { id: etiquetaId },
    select: CAMPOS_ETIQUETA,
  });
  if (!etiqueta) throw new Error("Etiqueta não encontrada nesta empresa.");
  // Arquivada sai do catálogo para frente, não do passado: quem já a tem,
  // mantém; conversa nova não a recebe.
  if (!etiqueta.ativa) throw new Error("Essa etiqueta foi arquivada e não pode ser aplicada.");

  try {
    await prisma.conversaEtiqueta.create({ data: { empresaId, conversaId, etiquetaId } });
    return { conversaId, etiquetaId, jaEstava: false };
  } catch (erro) {
    if (!ehConflitoDeUnicidade(erro)) throw erro;
    return { conversaId, etiquetaId, jaEstava: true };
  }
}

/**
 * Tira a etiqueta da conversa. Aqui o delete é o certo — a APLICAÇÃO é um fato
 * do atendimento em curso, não a taxonomia; o que não pode sumir é a etiqueta.
 * Idempotente: remover o que já não está devolve `removida: false`.
 */
export async function removerEtiqueta(
  conversaId: string,
  etiquetaId: string,
): Promise<{ removida: boolean }> {
  const { count } = await prisma.conversaEtiqueta.deleteMany({ where: { conversaId, etiquetaId } });
  return { removida: count > 0 };
}

// ─────────────────────────────────────────────────────────────
// Respostas rápidas
// ─────────────────────────────────────────────────────────────

/**
 * Respostas que o composer oferece.
 *
 * Com `filaId`, devolve as DA FILA mais as GERAIS (`filaId` nulo) numa lista
 * só: o atendente não deveria precisar saber de qual bolso veio o texto. Sem
 * `filaId`, devolve o catálogo inteiro — é a tela de configuração, que precisa
 * ver tudo, inclusive o que pertence a outras filas.
 */
export async function listarRespostasRapidas(
  filaId?: string | null,
  opcoes?: { incluirArquivadas?: boolean },
): Promise<RespostaRapidaResumo[]> {
  const escopo = filaId ? { OR: [{ filaId }, { filaId: null }] } : {};
  return prisma.respostaRapida.findMany({
    where: { ...escopo, ...(opcoes?.incluirArquivadas ? {} : { ativa: true }) },
    // Fila antes de geral: quando as duas existem, a resposta específica é a
    // que o atendente daquela fila quer ver primeiro. O `nulls: "last"` é
    // OBRIGATÓRIO — no Postgres, `DESC` põe NULL na FRENTE por padrão, o que
    // inverteria exatamente a intenção desta ordenação.
    orderBy: [{ filaId: { sort: "desc", nulls: "last" } }, { atalho: "asc" }],
    select: CAMPOS_RESPOSTA,
  });
}

/**
 * Cria a resposta rápida. O atalho é normalizado ANTES do unique
 * `(empresaId, atalho)` — é a normalização que faz o unique valer alguma coisa.
 * Atalho repetido é erro explícito, e não reativação silenciosa como no
 * catálogo de motivos: aqui o conflito significa que o texto de outra pessoa
 * seria disparado no lugar do seu, e isso o cadastrante precisa saber.
 */
export async function criarRespostaRapida(dados: {
  atalho: string;
  titulo: string;
  texto: string;
  filaId?: string | null;
}): Promise<RespostaRapidaResumo> {
  const { empresaId } = contextoTenantAtual();
  const atalho = atalhoRespostaRapidaSchema.parse(dados.atalho);
  const titulo = tituloDeRespostaSchema.parse(dados.titulo);
  const texto = textoDeRespostaSchema.parse(dados.texto);
  const filaId = dados.filaId ? await exigirFilaDoTenant(dados.filaId) : null;

  try {
    return await prisma.respostaRapida.create({
      data: { empresaId, atalho, titulo, texto, filaId },
      select: CAMPOS_RESPOSTA,
    });
  } catch (erro) {
    if (!ehConflitoDeUnicidade(erro)) throw erro;
    throw new Error(`Já existe uma resposta rápida com o atalho "/${atalho}".`);
  }
}

/**
 * Edita a resposta rápida. Campo ausente fica como está; `filaId: null` é
 * explícito e transforma a resposta em geral (por isso o teste é contra
 * `undefined`, não contra a falsidade do valor).
 */
export async function atualizarRespostaRapida(
  id: string,
  dados: { atalho?: string; titulo?: string; texto?: string; filaId?: string | null },
): Promise<RespostaRapidaResumo> {
  const data: Prisma.RespostaRapidaUpdateManyMutationInput & { filaId?: string | null } = {};
  if (dados.atalho !== undefined) data.atalho = atalhoRespostaRapidaSchema.parse(dados.atalho);
  if (dados.titulo !== undefined) data.titulo = tituloDeRespostaSchema.parse(dados.titulo);
  if (dados.texto !== undefined) data.texto = textoDeRespostaSchema.parse(dados.texto);
  if (dados.filaId !== undefined) {
    data.filaId = dados.filaId ? await exigirFilaDoTenant(dados.filaId) : null;
  }

  try {
    const [resposta] = await prisma.respostaRapida.updateManyAndReturn({
      where: { id },
      data,
      select: CAMPOS_RESPOSTA,
    });
    if (!resposta) throw new Error("Resposta rápida não encontrada nesta empresa.");
    return resposta;
  } catch (erro) {
    if (!ehConflitoDeUnicidade(erro)) throw erro;
    throw new Error(`Já existe uma resposta rápida com o atalho "/${String(data.atalho)}".`);
  }
}

/** Tira a resposta do composer sem apagar o texto — dá para reativar depois. */
export async function arquivarRespostaRapida(id: string): Promise<RespostaRapidaResumo> {
  const [resposta] = await prisma.respostaRapida.updateManyAndReturn({
    where: { id },
    data: { ativa: false },
    select: CAMPOS_RESPOSTA,
  });
  if (!resposta) throw new Error("Resposta rápida não encontrada nesta empresa.");
  return resposta;
}

// ─────────────────────────────────────────────────────────────
// Notas internas da conversa
// ─────────────────────────────────────────────────────────────

/** Notas internas em ordem cronológica — é uma linha do tempo, não um mural. */
export async function listarNotasDaConversa(conversaId: string): Promise<NotaDeConversa[]> {
  await exigirConversaDoTenant(conversaId);
  const notas = await prisma.notaConversa.findMany({
    where: { conversaId },
    orderBy: { criadoEm: "asc" },
    select: {
      id: true,
      conversaId: true,
      texto: true,
      autorUsuarioId: true,
      criadoEm: true,
      autor: { select: { nome: true } },
    },
  });
  return notas.map((n) => ({
    id: n.id,
    conversaId: n.conversaId,
    texto: n.texto,
    autorUsuarioId: n.autorUsuarioId,
    autorNome: n.autor.nome,
    criadoEm: n.criadoEm,
  }));
}

/**
 * Grava nota interna. NÃO cria `Mensagem` e não enfileira envio — é o ponto
 * inteiro da tabela separada (decisão 2 do topo).
 *
 * O autor é conferido contra o VÍNCULO ATIVO com a empresa, e não só contra
 * `Usuario`: `Usuario` é model global (allowlist `MODELS_GLOBAIS`), logo a
 * extension não o filtra por tenant — sem esta checagem, um id de usuário de
 * outra empresa viraria autor de nota aqui dentro.
 */
export async function criarNotaDeConversa(
  conversaId: string,
  autorUsuarioId: string,
  texto: string,
): Promise<NotaDeConversa> {
  const { empresaId } = contextoTenantAtual();
  await exigirConversaDoTenant(conversaId);
  const textoLimpo = textoDeNotaSchema.parse(texto);

  const vinculo = await prisma.vinculoUsuarioEmpresa.findFirst({
    where: { usuarioId: autorUsuarioId, ativo: true },
    select: { usuario: { select: { nome: true } } },
  });
  if (!vinculo) throw new Error("Autor não é membro ativo desta empresa.");

  const nota = await prisma.notaConversa.create({
    data: { empresaId, conversaId, autorUsuarioId, texto: textoLimpo },
    select: { id: true, conversaId: true, texto: true, autorUsuarioId: true, criadoEm: true },
  });

  return {
    id: nota.id,
    conversaId: nota.conversaId,
    texto: nota.texto,
    autorUsuarioId: nota.autorUsuarioId,
    autorNome: vinculo.usuario.nome,
    criadoEm: nota.criadoEm,
  };
}
