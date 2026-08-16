import { prisma, runWithTenant } from "@atende/db";
import { Badge, EstadoVazio, Icone, formatarRelativo } from "@atende/ui";

import { CANAIS, ESTADOS, type EstadoConversa, type TipoCanal } from "./vocabulario";

/**
 * A coluna 1 da inbox. É um server component reusado por `/inbox` e
 * `/inbox/[id]` — e NÃO um `layout.tsx`, apesar de aparecer nas duas.
 *
 * O motivo é o filtro: layouts do App Router não recebem `searchParams`, e
 * `?filtro=fila` precisa sobreviver ao link compartilhado e ao recarregar.
 * Renderizar a lista de novo a cada conversa aberta custa uma query indexada e
 * nenhum JS a mais no cliente; um layout custaria perder o filtro na URL.
 */

export const FILTROS = [
  { chave: "abertas", rotulo: "Abertas" },
  { chave: "fila", rotulo: "Na fila" },
  { chave: "minhas", rotulo: "Minhas" },
  { chave: "encerradas", rotulo: "Encerradas" },
] as const;

export type ChaveDeFiltro = (typeof FILTROS)[number]["chave"];

export function ehFiltro(v: string | undefined): v is ChaveDeFiltro {
  return FILTROS.some((f) => f.chave === v);
}

function whereDoFiltro(filtro: ChaveDeFiltro, usuarioId: string) {
  switch (filtro) {
    case "fila":
      return { estado: "fila_humano" as const };
    case "minhas":
      return { estado: "humano" as const, atendenteUsuarioId: usuarioId };
    case "encerradas":
      return { estado: "encerrada" as const };
    case "abertas":
      return { estado: { not: "encerrada" as const } };
  }
}

export async function ListaDeConversas({
  filtro,
  ativaId,
  empresaId,
  usuarioId,
}: {
  readonly filtro: ChaveDeFiltro;
  /** Conversa aberta na coluna 2 — fica destacada aqui. */
  readonly ativaId?: string;
  readonly empresaId: string;
  readonly usuarioId: string;
}) {
  const conversas = await runWithTenant({ empresaId, usuarioId }, () =>
    prisma.conversa.findMany({
      where: { deletedAt: null, ...whereDoFiltro(filtro, usuarioId) },
      orderBy: { atualizadoEm: "desc" },
      take: 100,
      include: {
        cliente: true,
        canal: true,
        atendente: true,
        mensagens: { orderBy: { criadoEm: "desc" }, take: 1 },
      },
    }),
  );

  return (
    <section
      aria-label="Conversas"
      className="flex min-h-0 flex-col border-r border-borda bg-superficie"
    >
      <header className="flex flex-col gap-3 border-b border-borda px-4 pb-3 pt-4">
        <h1 className="text-[19px] font-semibold tracking-tight">Inbox</h1>
        <nav className="ie-pilulas" aria-label="Filtrar conversas">
          {FILTROS.map((f) => (
            <a
              key={f.chave}
              href={`/inbox?filtro=${f.chave}`}
              className={`ie-chip${filtro === f.chave ? " ie-chip--ativo" : ""}`}
              aria-current={filtro === f.chave ? "page" : undefined}
            >
              {f.rotulo}
            </a>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto barra-fina">
        {conversas.length === 0 ? (
          <EstadoVazio
            icone="conversa"
            titulo="Nenhuma conversa aqui"
            descricao="Assim que um cliente escrever num canal conectado, a conversa aparece nesta lista."
          />
        ) : (
          <ul className="flex flex-col">
            {conversas.map((c) => {
              const canal = CANAIS[c.canal.tipo as TipoCanal];
              const estado = ESTADOS[c.estado as EstadoConversa];
              const selecionada = c.id === ativaId;
              return (
                <li key={c.id}>
                  <a
                    href={`/inbox/${c.id}?filtro=${filtro}`}
                    aria-current={selecionada ? "page" : undefined}
                    className={`flex flex-col gap-1 border-b border-borda/60 px-4 py-3 transition-colors ${
                      selecionada
                        ? "bg-acento-fraco"
                        : "hover:bg-superficie-2"
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                        {c.cliente.nome}
                      </span>
                      <span className="shrink-0 text-[11px] text-texto-fraco">
                        {formatarRelativo(c.atualizadoEm)}
                      </span>
                    </div>
                    <p className="truncate text-[12px] text-texto-suave">
                      {c.mensagens[0]?.texto ?? "Sem mensagens"}
                    </p>
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="inline-flex items-center gap-1 text-[11px] text-texto-fraco">
                        <Icone nome={canal.icone} aria-hidden />
                        {canal.curto}
                      </span>
                      <Badge tom={estado.tom} semPonto>
                        {estado.rotulo}
                      </Badge>
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
      </div>
    </section>
  );
}
