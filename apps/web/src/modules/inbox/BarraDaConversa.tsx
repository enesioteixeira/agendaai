import { Badge, Icone } from "@atende/ui";

import {
  assumirConversaAction,
  devolverConversaAction,
  encerrarConversaAction,
  reabrirConversaAction,
} from "@/modules/atendimento/actions";

import { CANAIS, ESTADOS, type EstadoConversa, type TipoCanal } from "./vocabulario";

/**
 * O cabeçalho da conversa aberta: quem é, por onde fala, em que estado está e o
 * que dá para fazer agora.
 *
 * As ações são decididas pelo ESTADO, não empilhadas todas com metade
 * desabilitada: botão cinza obriga o operador a descobrir por tentativa por que
 * não pode clicar. Cada estado mostra só o que faz sentido a partir dele.
 */
export function BarraDaConversa({
  conversa,
  podeAssumir,
  souOAtendente,
}: {
  readonly conversa: {
    readonly id: string;
    readonly estado: string;
    readonly cliente: { readonly nome: string };
    readonly canal: { readonly tipo: string; readonly nome: string };
    readonly atendente: { readonly nome: string } | null;
  };
  readonly podeAssumir: boolean;
  readonly souOAtendente: boolean;
}) {
  const canal = CANAIS[conversa.canal.tipo as TipoCanal];
  const estado = ESTADOS[conversa.estado as EstadoConversa];

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-borda bg-superficie px-4 py-3">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold tracking-tight">
          {conversa.cliente.nome}
        </h1>
        <p className="flex items-center gap-1.5 text-[11px] text-texto-fraco">
          <Icone nome={canal.icone} aria-hidden />
          {canal.rotulo} · {conversa.canal.nome}
          {conversa.atendente ? ` · com ${conversa.atendente.nome}` : ""}
        </p>
      </div>

      <Badge tom={estado.tom}>{estado.rotulo}</Badge>

      <div className="flex items-center gap-2">
        {conversa.estado === "fila_humano" && podeAssumir ? (
          <form action={assumirConversaAction}>
            <input type="hidden" name="id" value={conversa.id} />
            <button type="submit" className="ie-botao ie-botao--primario">
              Assumir
            </button>
          </form>
        ) : null}

        {/* Devolver só aparece para quem está atendendo: um atendente tirar a
            conversa da mão de outro é decisão de supervisão, não de inbox. */}
        {conversa.estado === "humano" && souOAtendente ? (
          <form action={devolverConversaAction}>
            <input type="hidden" name="id" value={conversa.id} />
            <button type="submit" className="ie-botao">
              Devolver à fila
            </button>
          </form>
        ) : null}

        {conversa.estado === "encerrada" ? (
          <form action={reabrirConversaAction}>
            <input type="hidden" name="id" value={conversa.id} />
            <button type="submit" className="ie-botao">
              Reabrir
            </button>
          </form>
        ) : (
          <form action={encerrarConversaAction}>
            <input type="hidden" name="id" value={conversa.id} />
            <button type="submit" className="ie-botao">
              Encerrar
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
