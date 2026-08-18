"use client";

import { useActionState } from "react";

import { Badge, Icone } from "@atende/ui";

import {
  aplicarEtiquetaAction,
  removerEtiquetaAction,
  type EstadoDaInbox,
} from "./actions";
import { tomDaEtiqueta } from "./vocabulario";

/**
 * As etiquetas da conversa aberta: as aplicadas, com como tirar; e o catálogo do
 * tenant, com como pôr.
 *
 * As cores são TONS DO CHASSI (`EtiquetaConversa.cor` guarda "info", "sucesso"…),
 * então a etiqueta cadastrada em `/configuracoes/atendimento/catalogos` aparece
 * aqui exatamente como apareceu lá — e continua legível no tema claro e no
 * escuro sem ninguém remedir contraste.
 *
 * O catálogo fica dentro de um `<details>` nativo: um tenant com vinte etiquetas
 * empurraria a primeira mensagem para fora da tela no celular, e a lista de
 * escolha só interessa no momento de escolher.
 *
 * Aplicar e remover são IDEMPOTENTES na camada de dados — dois atendentes
 * clicando na mesma etiqueta ao mesmo tempo não vira erro de unique na cara de
 * quem está no meio de um atendimento.
 */

export interface EtiquetaDaInbox {
  readonly id: string;
  readonly nome: string;
  readonly cor: string | null;
}

/** Um botão = um `<form>` com estado próprio, para o erro nascer ao lado do clique. */
function AcaoDeEtiqueta({
  action,
  conversaId,
  etiquetaId,
  children,
  className,
  rotuloAcessivel,
}: {
  readonly action: (prev: EstadoDaInbox, fd: FormData) => Promise<EstadoDaInbox>;
  readonly conversaId: string;
  readonly etiquetaId: string;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly rotuloAcessivel: string;
}) {
  const [estado, enviar, pendente] = useActionState<EstadoDaInbox, FormData>(action, {});

  return (
    <form action={enviar} className="inline-flex items-center gap-1">
      <input type="hidden" name="conversaId" value={conversaId} />
      <input type="hidden" name="etiquetaId" value={etiquetaId} />
      <button
        type="submit"
        disabled={pendente}
        aria-label={rotuloAcessivel}
        className={`inline-flex items-center gap-1 disabled:opacity-50 ${className ?? ""}`}
      >
        {children}
      </button>
      {estado.erro ? (
        <span role="alert" className="text-[11px] text-atencao">
          {estado.erro}
        </span>
      ) : null}
    </form>
  );
}

export function EtiquetasDaConversa({
  conversaId,
  aplicadas,
  catalogo,
}: {
  readonly conversaId: string;
  readonly aplicadas: readonly EtiquetaDaInbox[];
  /** Etiquetas ATIVAS do tenant — arquivada não pode ser aplicada em conversa nova. */
  readonly catalogo: readonly EtiquetaDaInbox[];
}) {
  const jaAplicadas = new Set(aplicadas.map((e) => e.id));
  const disponiveis = catalogo.filter((e) => !jaAplicadas.has(e.id));

  return (
    <section aria-label="Etiquetas da conversa" className="flex flex-wrap items-center gap-1.5">
      {aplicadas.map((e) => (
        <AcaoDeEtiqueta
          key={e.id}
          action={removerEtiquetaAction}
          conversaId={conversaId}
          etiquetaId={e.id}
          rotuloAcessivel={`Remover a etiqueta ${e.nome}`}
          className="text-texto-fraco hover:text-perigo"
        >
          <Badge tom={tomDaEtiqueta(e.cor)} semPonto>
            {e.nome}
          </Badge>
          <Icone nome="fechar" aria-hidden />
        </AcaoDeEtiqueta>
      ))}

      {disponiveis.length > 0 ? (
        <details className="relative">
          <summary className="ie-chip cursor-pointer list-none">
            <Icone nome="etiqueta" aria-hidden />
            Etiquetar
          </summary>
          {/* Absoluto no desktop, mas com `max-w` e rolagem: num catálogo grande
              a lista não pode virar uma coluna infinita que cobre a conversa. */}
          <div className="absolute right-0 z-10 mt-1 flex max-h-64 w-max max-w-[min(18rem,80vw)] flex-col gap-1 overflow-y-auto rounded-2 border border-borda bg-superficie p-2 shadow-2 barra-fina">
            {disponiveis.map((e) => (
              <AcaoDeEtiqueta
                key={e.id}
                action={aplicarEtiquetaAction}
                conversaId={conversaId}
                etiquetaId={e.id}
                rotuloAcessivel={`Aplicar a etiqueta ${e.nome}`}
                className="w-full justify-start rounded-2 px-1 py-0.5 hover:bg-superficie-2"
              >
                <Badge tom={tomDaEtiqueta(e.cor)} semPonto>
                  {e.nome}
                </Badge>
              </AcaoDeEtiqueta>
            ))}
          </div>
        </details>
      ) : null}

      {aplicadas.length === 0 && disponiveis.length === 0 ? (
        <span className="text-[11px] text-texto-fraco">
          Nenhuma etiqueta cadastrada nesta empresa.
        </span>
      ) : null}
    </section>
  );
}
