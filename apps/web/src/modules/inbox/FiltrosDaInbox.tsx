import { Icone } from "@atende/ui";

import {
  DONOS,
  ESTADOS_FILTRAVEIS,
  SEM_FILTROS,
  alternar,
  montarQuery,
  quantosFiltrosFinos,
  type Dono,
  type FiltrosDaInbox as Filtros,
} from "./filtros";
import { ESTADOS, PRAZOS } from "./vocabulario";

/**
 * A barra de filtros da lista.
 *
 * SERVER COMPONENT COM `<a href>`, e não um formulário controlado. Três
 * consequências que são o motivo da escolha:
 *
 * 1. **O recorte é a URL.** Compartilhar "as estouradas do Financeiro" é copiar
 *    o endereço; recarregar no meio do turno não perde o filtro.
 * 2. **Funciona sem JavaScript**, como o resto do painel — e num celular em
 *    3G no corredor do distribuidor, a lista filtrada chega antes de qualquer
 *    bundle hidratar.
 * 3. **Zero estado para dessincronizar** com o que a consulta de fato aplicou.
 *
 * DUAS CAMADAS, e isso é sobre tela estreita. O que se troca o tempo todo
 * (`minhas` / `sem dono` / `todas`) fica sempre visível; fila, estado e prazo
 * moram num `<details>` nativo. Empilhar as quatro dimensões abertas em 390 px
 * empurraria a primeira conversa para fora da tela — a lista é o produto, o
 * filtro é o caminho até ela. O `<details>` abre sozinho quando algum filtro
 * fino está ligado: recorte ativo escondido atrás de um triângulo faz o operador
 * concluir que a fila está vazia.
 */

const ROTULO_DO_DONO: Record<Dono, string> = {
  todas: "Todas",
  minhas: "Minhas",
  sem_dono: "Sem dono",
};

const EXPLICACAO_DO_DONO: Record<Dono, string> = {
  todas: "Todas as conversas do time",
  minhas: "Conversas em que você é o atendente",
  sem_dono: "Ninguém assumiu ainda",
};

function Pilula({
  href,
  ativo,
  children,
  title,
}: {
  readonly href: string;
  readonly ativo: boolean;
  readonly children: React.ReactNode;
  readonly title?: string;
}) {
  return (
    <a
      href={href}
      className={`ie-chip${ativo ? " ie-chip--ativo" : ""}`}
      aria-current={ativo ? "true" : undefined}
      {...(title === undefined ? {} : { title })}
    >
      {children}
    </a>
  );
}

function Grupo({
  rotulo,
  children,
}: {
  readonly rotulo: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-texto-fraco">
        {rotulo}
      </span>
      <div className="ie-pilulas">{children}</div>
    </div>
  );
}

export function FiltrosDaInbox({
  filtros,
  filas,
}: {
  readonly filtros: Filtros;
  /** Só as filas ATIVAS do tenant — `listarFilas()` já corta as arquivadas. */
  readonly filas: readonly { readonly id: string; readonly nome: string }[];
}) {
  const finos = quantosFiltrosFinos(filtros);
  const link = (f: Filtros) => `/inbox${montarQuery(f)}`;

  return (
    <div className="flex flex-col gap-2">
      <nav className="ie-pilulas" aria-label="Filtrar por responsável">
        {DONOS.map((d) => (
          <Pilula
            key={d}
            href={link({ ...filtros, de: d })}
            ativo={filtros.de === d}
            title={EXPLICACAO_DO_DONO[d]}
          >
            {ROTULO_DO_DONO[d]}
          </Pilula>
        ))}
      </nav>

      <details open={finos > 0} className="rounded-2 border border-borda bg-superficie-2">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-texto-suave">
          <Icone nome="filtro" aria-hidden />
          Fila, estado e prazo
          {finos > 0 ? (
            <span className="ie-chip__qtd" aria-label={`${finos} filtros ativos`}>
              {finos}
            </span>
          ) : null}
        </summary>

        <div className="flex flex-col gap-3 border-t border-borda px-2.5 py-2.5">
          <Grupo rotulo="Prazo de primeira resposta">
            {/* Ordem deliberada: o que estourou primeiro, o que vai estourar em
                seguida. É a ordem em que o operador precisa pensar, e a lista
                em si passa a ser ordenada pelo prazo mais apertado quando um
                destes está ligado (ver `listarInbox`). */}
            {(["estourado", "perto_do_estouro", "no_prazo", "cumprido", "sem_prazo"] as const).map(
              (p) => (
                <Pilula
                  key={p}
                  href={link(alternar(filtros, "prazo", p))}
                  ativo={filtros.prazo === p}
                  title={PRAZOS[p].rotulo}
                >
                  {PRAZOS[p].curto}
                </Pilula>
              ),
            )}
          </Grupo>

          <Grupo rotulo="Estado">
            {ESTADOS_FILTRAVEIS.map((e) => (
              <Pilula
                key={e}
                href={link(alternar(filtros, "estado", e))}
                ativo={filtros.estado === e}
              >
                {ESTADOS[e].rotulo}
              </Pilula>
            ))}
          </Grupo>

          <Grupo rotulo="Fila">
            {filas.length === 0 ? (
              // A empresa pode não ter fila nenhuma (a entrada continua caindo
              // na inbox). Dizer isso é melhor que um grupo vazio, que parece
              // carregamento travado.
              <span className="text-[11px] text-texto-fraco">
                Nenhuma fila configurada nesta empresa.
              </span>
            ) : (
              filas.map((f) => (
                <Pilula
                  key={f.id}
                  href={link(alternar(filtros, "fila", f.id))}
                  ativo={filtros.fila === f.id}
                >
                  {f.nome}
                </Pilula>
              ))
            )}
          </Grupo>

          {finos > 0 || filtros.de !== "todas" ? (
            <a href={link(SEM_FILTROS)} className="self-start text-[11px] text-acento underline">
              Limpar filtros
            </a>
          ) : null}
        </div>
      </details>
    </div>
  );
}
