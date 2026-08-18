import { listarInbox, runWithTenant } from "@atende/db";
import { Badge, EstadoVazio, Icone, formatarRelativo } from "@atende/ui";

import { FiltrosDaInbox } from "./FiltrosDaInbox";
import { filtroDeConsulta, montarQuery, type FiltrosDaInbox as Filtros } from "./filtros";
import { CANAIS, ESTADOS, PRAZOS, type EstadoConversa, type TipoCanal } from "./vocabulario";

/**
 * A coluna 1 da inbox. É um server component reusado por `/inbox` e
 * `/inbox/[id]` — e NÃO um `layout.tsx`, apesar de aparecer nas duas.
 *
 * O motivo é o filtro: layouts do App Router não recebem `searchParams`, e o
 * recorte (`?de=minhas&prazo=estourado`) precisa sobreviver ao link
 * compartilhado e ao recarregar. Renderizar a lista de novo a cada conversa
 * aberta custa as consultas indexadas de `listarInbox` e nenhum JS a mais no
 * cliente; um layout custaria perder o filtro na URL.
 *
 * A CONSULTA NÃO MORA MAIS AQUI. Antes esta tela montava o próprio `findMany`;
 * agora chama `listarInbox` de `@atende/db`, que traz fila, prazo e "não lidas"
 * sem N+1 e — o que importa — calcula a situação do prazo com `situacaoDoPrazo`
 * do núcleo. Um segundo lugar decidindo o que é "perto de estourar" daria duas
 * respostas para a mesma conversa: a da lista e a do relatório.
 */

/** Nome que o operador reconhece: razão social quando existe, senão o cadastro. */
function nomeDoCliente(cliente: { nome: string; razaoSocial: string | null }): string {
  return cliente.razaoSocial ?? cliente.nome;
}

/**
 * Janela da lista. `listarInbox` tem página padrão de 50 e teto de 200; pedimos
 * 100 explicitamente porque era o que esta tela já mostrava, e ainda NÃO existe
 * paginação — cair para 50 sem "carregar mais" faria conversas desaparecerem da
 * caixa de quem tem movimento, que é o defeito que ninguém reporta como bug
 * ("sumiu") e todo mundo sente. Quando houver paginação, este número sai daqui.
 */
const JANELA = 100;

export async function ListaDeConversas({
  filtros,
  ativaId,
  empresaId,
  usuarioId,
  filas,
}: {
  readonly filtros: Filtros;
  /** Conversa aberta na coluna 2 — fica destacada aqui. */
  readonly ativaId?: string;
  readonly empresaId: string;
  readonly usuarioId: string;
  /** Filas ativas do tenant, já lidas pela página (a barra de filtros as usa). */
  readonly filas: readonly { readonly id: string; readonly nome: string }[];
}) {
  const conversas = await runWithTenant({ empresaId, usuarioId }, () =>
    listarInbox({ ...filtroDeConsulta(filtros, usuarioId), limite: JANELA }),
  );

  const query = montarQuery(filtros);
  const temFiltro = query !== "";

  return (
    <section
      aria-label="Conversas"
      className="flex min-h-0 flex-col border-r border-borda bg-superficie"
    >
      <header className="flex flex-col gap-3 border-b border-borda px-4 pb-3 pt-4">
        <h1 className="text-[19px] font-semibold tracking-tight">Inbox</h1>
        <FiltrosDaInbox filtros={filtros} filas={filas} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto barra-fina">
        {conversas.length === 0 ? (
          <EstadoVazio
            icone={temFiltro ? "filtro" : "conversa"}
            titulo={temFiltro ? "Nada neste recorte" : "Nenhuma conversa aqui"}
            descricao={
              // Distinguir os dois casos evita a conclusão errada mais cara da
              // tela: "não tem cliente falando" quando na verdade o filtro de
              // ontem continua ligado.
              temFiltro
                ? "Nenhuma conversa combina com os filtros ligados. Limpe os filtros para ver a caixa inteira."
                : "Assim que um cliente escrever num canal conectado, a conversa aparece nesta lista."
            }
          />
        ) : (
          <ul className="flex flex-col">
            {conversas.map((c) => {
              const canal = CANAIS[c.canal.tipo as TipoCanal];
              const estado = ESTADOS[c.estado as EstadoConversa];
              const prazo = PRAZOS[c.situacaoPrazo];
              const selecionada = c.conversaId === ativaId;

              return (
                <li key={c.conversaId}>
                  <a
                    href={`/inbox/${c.conversaId}${query}`}
                    aria-current={selecionada ? "page" : undefined}
                    // A barra colorida à esquerda é o que se enxerga de longe
                    // numa lista de cem linhas — e é a única marca que sobrevive
                    // ao celular, onde o selo de prazo já disputa espaço com o
                    // canal e a fila.
                    className={`flex flex-col gap-1 border-b border-borda/60 border-l-[3px] px-4 py-3 transition-colors ${
                      c.situacaoPrazo === "estourado"
                        ? "border-l-perigo"
                        : c.situacaoPrazo === "perto_do_estouro"
                          ? "border-l-atencao"
                          : "border-l-transparent"
                    } ${selecionada ? "bg-acento-fraco" : "hover:bg-superficie-2"}`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                        {nomeDoCliente(c.cliente)}
                      </span>
                      {c.naoLidas > 0 ? (
                        <span
                          className="ie-chip__qtd shrink-0"
                          aria-label={`${c.naoLidas} sem resposta`}
                        >
                          {c.naoLidas}
                        </span>
                      ) : null}
                      <span className="shrink-0 text-[11px] text-texto-fraco">
                        {formatarRelativo(c.atualizadoEm)}
                      </span>
                    </div>

                    <p className="truncate text-[12px] text-texto-suave">
                      {c.ultimaMensagem?.texto ?? "Sem mensagens"}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
                      <span className="inline-flex items-center gap-1 text-[11px] text-texto-fraco">
                        <Icone nome={canal.icone} aria-hidden />
                        {canal.curto}
                      </span>
                      <Badge tom={estado.tom} semPonto>
                        {estado.rotulo}
                      </Badge>

                      {/* A fila aparece SEMPRE que existe, inclusive filtrada:
                          numa lista de cem linhas o operador precisa saber de
                          onde veio a conversa sem abri-la. */}
                      {c.fila ? (
                        <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-texto-fraco">
                          <Icone nome="camadas" aria-hidden />
                          <span className="truncate">{c.fila.nome}</span>
                        </span>
                      ) : null}

                      {/* "Sem prazo" e "já respondida" não viram selo: seriam
                          duas pílulas cinzas em toda linha da lista, e ruído
                          constante ensina o operador a não olhar para o lugar
                          onde o alerta vai aparecer. */}
                      {prazo.urgente ? (
                        <Badge
                          tom={prazo.tom}
                          semPonto
                          title={
                            c.prazoPrimeiraRespostaEm
                              ? `${prazo.rotulo} · ${formatarRelativo(c.prazoPrimeiraRespostaEm)}`
                              : prazo.rotulo
                          }
                        >
                          {c.prazoPrimeiraRespostaEm
                            ? `${prazo.curto} ${formatarRelativo(c.prazoPrimeiraRespostaEm)}`
                            : prazo.curto}
                        </Badge>
                      ) : null}

                      {c.atendente ? (
                        <span className="truncate text-[11px] text-texto-fraco">
                          {c.atendente.nome}
                        </span>
                      ) : null}
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        {/* Sem paginação, a lista cortada precisa DIZER que foi cortada: uma
            lista que simplesmente termina na centésima linha é lida como "acabou",
            e o que ficou de fora nunca é procurado. */}
        {conversas.length >= JANELA ? (
          <p className="border-t border-borda px-4 py-3 text-[11px] text-texto-fraco">
            Mostrando as {JANELA} conversas mais recentes deste recorte. Use os filtros para chegar
            ao que falta.
          </p>
        ) : null}
      </div>
    </section>
  );
}
