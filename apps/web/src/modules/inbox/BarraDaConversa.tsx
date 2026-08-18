"use client";

import { useActionState } from "react";

import { Badge, Icone, formatarRelativo } from "@atende/ui";

import {
  assumirConversaAction,
  devolverConversaAction,
  reabrirConversaAction,
  type EstadoAtendimento,
} from "@/modules/atendimento/actions";

import { EncerrarConversa } from "./EncerrarConversa";
import { EtiquetasDaConversa, type EtiquetaDaInbox } from "./EtiquetasDaConversa";
import {
  CANAIS,
  ESTADOS,
  PRAZOS,
  type EstadoConversa,
  type SituacaoPrazo,
  type TipoCanal,
} from "./vocabulario";

/**
 * O cabeçalho da conversa aberta: quem é, por onde fala, de que fila veio, em
 * que situação está o prazo, como está etiquetada e o que dá para fazer agora.
 *
 * As ações são decididas pelo ESTADO, não empilhadas todas com metade
 * desabilitada: botão cinza obriga o operador a descobrir por tentativa por que
 * não pode clicar. Cada estado mostra só o que faz sentido a partir dele.
 *
 * É client component porque perder a corrida do claim ("já foi assumida por
 * outra pessoa") é caminho normal entre dois atendentes, e precisa aparecer
 * como aviso aqui — não como tela de erro.
 *
 * ENCERRAR NÃO É MAIS UM BOTÃO DE AÇÃO DIRETA: virou `EncerrarConversa`, que
 * abre a escolha do motivo. É a única mudança de comportamento nesta barra, e
 * ela é deliberada — encerramento sem motivo deixa o relatório do mês cego.
 */

/** Botão de ação com estado próprio, para o erro nascer ao lado do clique. */
function AcaoComEstado({
  action,
  conversaId,
  rotulo,
  variante,
}: {
  readonly action: (
    prev: EstadoAtendimento,
    fd: FormData,
  ) => Promise<EstadoAtendimento>;
  readonly conversaId: string;
  readonly rotulo: string;
  readonly variante?: "primario";
}) {
  const [estado, enviar, pendente] = useActionState<EstadoAtendimento, FormData>(action, {});

  return (
    <form action={enviar} className="flex items-center gap-2">
      <input type="hidden" name="id" value={conversaId} />
      <button
        type="submit"
        disabled={pendente}
        className={`ie-botao${variante === "primario" ? " ie-botao--primario" : ""}`}
      >
        {pendente ? "…" : rotulo}
      </button>
      {estado.erro ? (
        <span role="alert" className="text-[11px] text-atencao">
          {estado.erro}
        </span>
      ) : null}
    </form>
  );
}

export function BarraDaConversa({
  conversa,
  podeAssumir,
  souOAtendente,
  motivos,
  etiquetas,
  catalogoDeEtiquetas,
}: {
  readonly conversa: {
    readonly id: string;
    readonly estado: string;
    readonly cliente: { readonly nome: string };
    readonly canal: { readonly tipo: string; readonly nome: string };
    readonly atendente: { readonly nome: string } | null;
    readonly fila: { readonly nome: string } | null;
    readonly situacaoPrazo: SituacaoPrazo;
    readonly prazoPrimeiraRespostaEm: Date | null;
  };
  readonly podeAssumir: boolean;
  readonly souOAtendente: boolean;
  readonly motivos: readonly { readonly id: string; readonly nome: string }[];
  readonly etiquetas: readonly EtiquetaDaInbox[];
  readonly catalogoDeEtiquetas: readonly EtiquetaDaInbox[];
}) {
  const canal = CANAIS[conversa.canal.tipo as TipoCanal];
  const estado = ESTADOS[conversa.estado as EstadoConversa];
  const prazo = PRAZOS[conversa.situacaoPrazo];

  return (
    <header className="flex flex-col gap-2 border-b border-borda bg-superficie px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">
            {conversa.cliente.nome}
          </h1>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-texto-fraco">
            <Icone nome={canal.icone} aria-hidden />
            {canal.rotulo} · {conversa.canal.nome}
            {/* A fila responde "por que esta conversa é minha" — e é ela que
                define o prazo prometido. Escondê-la aqui obrigaria a voltar
                para a lista só para conferir. */}
            {conversa.fila ? ` · fila ${conversa.fila.nome}` : ""}
            {conversa.atendente ? ` · com ${conversa.atendente.nome}` : ""}
          </p>
        </div>

        <Badge tom={estado.tom}>{estado.rotulo}</Badge>

        {/* Ao contrário da lista, aqui o prazo aparece SEMPRE, inclusive
            "sem prazo" e "já respondida": são duas pílulas em UMA tela, não em
            cem linhas, e a pergunta "esta conversa tem compromisso?" é a que o
            atendente faz antes de decidir se responde agora ou termina a outra. */}
        <Badge
          tom={prazo.tom}
          title={
            conversa.prazoPrimeiraRespostaEm
              ? `${prazo.rotulo} · ${formatarRelativo(conversa.prazoPrimeiraRespostaEm)}`
              : prazo.rotulo
          }
        >
          {conversa.situacaoPrazo === "estourado" || conversa.situacaoPrazo === "perto_do_estouro"
            ? conversa.prazoPrimeiraRespostaEm
              ? `${prazo.rotulo} ${formatarRelativo(conversa.prazoPrimeiraRespostaEm)}`
              : prazo.rotulo
            : prazo.rotulo}
        </Badge>

        <div className="flex flex-wrap items-center gap-2">
          {conversa.estado === "fila_humano" && podeAssumir ? (
            <AcaoComEstado
              action={assumirConversaAction}
              conversaId={conversa.id}
              rotulo="Assumir"
              variante="primario"
            />
          ) : null}

          {/* Devolver só aparece para quem está atendendo: um atendente tirar a
              conversa da mão de outro é decisão de supervisão, não de inbox. */}
          {conversa.estado === "humano" && souOAtendente ? (
            <AcaoComEstado
              action={devolverConversaAction}
              conversaId={conversa.id}
              rotulo="Devolver à fila"
            />
          ) : null}

          {conversa.estado === "encerrada" ? (
            <AcaoComEstado
              action={reabrirConversaAction}
              conversaId={conversa.id}
              rotulo="Reabrir"
            />
          ) : (
            <EncerrarConversa conversaId={conversa.id} motivos={motivos} />
          )}
        </div>
      </div>

      <EtiquetasDaConversa
        conversaId={conversa.id}
        aplicadas={etiquetas}
        catalogo={catalogoDeEtiquetas}
      />
    </header>
  );
}
