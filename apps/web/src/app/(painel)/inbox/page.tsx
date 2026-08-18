import { redirect } from "next/navigation";

import { temEscopo } from "@atende/core";
import { listarFilas, runWithTenant } from "@atende/db";
import { EstadoVazio } from "@atende/ui";

import { PulsoDaInbox } from "@/modules/inbox/PulsoDaInbox";
import { ListaDeConversas } from "@/modules/inbox/ListaDeConversas";
import { lerFiltros } from "@/modules/inbox/filtros";
import { lerSessao } from "@/lib/sessao";

// Inbox sem conversa aberta: a lista viva à esquerda, convite a escolher no meio.
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  if (!temEscopo(sessao, "atendimento:responder")) {
    return (
      <div className="p-6">
        <EstadoVazio
          icone="escudo"
          titulo="Sem acesso à inbox"
          descricao="Seu papel não atende conversas. Peça a um administrador o escopo atendimento:responder."
        />
      </div>
    );
  }

  const params = await searchParams;
  // As filas são lidas ANTES dos filtros porque `lerFiltros` usa a lista para
  // descartar um `?fila=` que não é deste tenant — sem isso, um id colado de
  // outra empresa mostraria "nenhuma conversa" como se a fila estivesse vazia.
  const filas = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    () => listarFilas(),
  );
  const filtros = lerFiltros(params, filas);

  return (
    // No celular só a LISTA aparece: o convite "selecione uma conversa" ao lado
    // não tem lado nenhum numa tela de 390px, e ocuparia a altura toda dizendo
    // ao usuário para fazer algo que ele já está fazendo.
    <div className="grid h-full grid-cols-1 overflow-hidden lg:grid-cols-[340px_1fr]">
      <PulsoDaInbox />
      <ListaDeConversas
        filtros={filtros}
        filas={filas}
        empresaId={sessao.empresaId}
        usuarioId={sessao.usuarioId}
      />
      <section
        aria-label="Conversa"
        className="hidden min-h-0 place-items-center bg-fundo p-6 lg:grid"
      >
        <EstadoVazio
          icone="conversa"
          titulo="Selecione uma conversa"
          descricao="Escolha uma conversa à esquerda para ler o histórico e responder."
        />
      </section>
    </div>
  );
}
