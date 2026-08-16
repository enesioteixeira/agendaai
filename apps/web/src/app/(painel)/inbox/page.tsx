import { redirect } from "next/navigation";

import { temEscopo } from "@atende/core";
import { EstadoVazio } from "@atende/ui";

import { PulsoDaInbox } from "@/modules/inbox/PulsoDaInbox";
import { ListaDeConversas, ehFiltro } from "@/modules/inbox/ListaDeConversas";
import { lerSessao } from "@/lib/sessao";

// Inbox sem conversa aberta: a lista viva à esquerda, convite a escolher no meio.
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  const params = await searchParams;
  const filtro = ehFiltro(params.filtro) ? params.filtro : "abertas";

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

  return (
    <div className="grid h-full grid-cols-[340px_1fr] overflow-hidden">
      <PulsoDaInbox />
      <ListaDeConversas
        filtro={filtro}
        empresaId={sessao.empresaId}
        usuarioId={sessao.usuarioId}
      />
      <section aria-label="Conversa" className="grid min-h-0 place-items-center bg-fundo p-6">
        <EstadoVazio
          icone="conversa"
          titulo="Selecione uma conversa"
          descricao="Escolha uma conversa à esquerda para ler o histórico e responder."
        />
      </section>
    </div>
  );
}
