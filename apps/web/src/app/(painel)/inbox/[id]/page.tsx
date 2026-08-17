import { notFound, redirect } from "next/navigation";

import { temEscopo } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { EstadoVazio } from "@atende/ui";

import { PulsoDaInbox } from "@/modules/inbox/PulsoDaInbox";
import { BarraDaConversa } from "@/modules/inbox/BarraDaConversa";
import { Composer } from "@/modules/inbox/Composer";
import { ListaDeConversas, ehFiltro } from "@/modules/inbox/ListaDeConversas";
import { PainelDoContato } from "@/modules/inbox/PainelDoContato";
import { Timeline } from "@/modules/inbox/Timeline";
import { lerSessao } from "@/lib/sessao";

// A inbox com uma conversa aberta: lista · timeline · contexto.
export default async function ConversaDaInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filtro?: string }>;
}) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const filtro = ehFiltro(query.filtro) ? query.filtro : "abertas";

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

  const conversa = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    () =>
      prisma.conversa.findUnique({
        where: { id },
        include: {
          canal: true,
          atendente: true,
          cliente: {
            include: {
              identidades: {
                where: { deletedAt: null },
                orderBy: { tipo: "asc" },
              },
            },
          },
          // 500 é o teto da janela que a tela desenha de uma vez; conversa mais
          // longa que isso pede paginação para trás, não uma página de 3 mil
          // bolhas que trava o navegador.
          mensagens: {
            orderBy: { criadoEm: "asc" },
            take: 500,
            include: { autor: { select: { nome: true } } },
          },
        },
      }),
  );

  // `notFound` e não 403 quando a conversa é de outro tenant: a extension de
  // tenancy já a torna invisível, e distinguir "não existe" de "não é sua"
  // confirmaria a existência de um id alheio.
  if (!conversa || conversa.deletedAt) notFound();

  const encerrada = conversa.estado === "encerrada";
  const souOAtendente = conversa.atendenteUsuarioId === sessao.usuarioId;
  // Responder também assume a conversa (ver `responderConversaAction`), então o
  // composer aparece na fila; o que ele não faz é deixar escrever em conversa de
  // outro atendente ou já encerrada.
  const podeEscrever =
    !encerrada && (conversa.estado === "fila_humano" || souOAtendente);

  return (
    // Uma coluna de cada vez conforme a largura permite:
    //   celular → só a conversa (com "voltar" na barra)
    //   ≥ lg    → lista + conversa
    //   ≥ xl    → lista + conversa + contexto
    // O contato é o primeiro a sair porque é apoio; a conversa é o trabalho.
    <div className="grid h-full grid-cols-1 overflow-hidden lg:grid-cols-[340px_1fr] xl:grid-cols-[340px_1fr_300px]">
      <PulsoDaInbox />

      {/* A lista some no celular: quem abriu a conversa quer a conversa, e
          empilhar as duas faria rolar cem itens até chegar na primeira bolha. */}
      <div className="hidden min-h-0 lg:grid">
        <ListaDeConversas
          filtro={filtro}
          ativaId={conversa.id}
          empresaId={sessao.empresaId}
          usuarioId={sessao.usuarioId}
        />
      </div>

      <section aria-label="Conversa" className="flex min-h-0 flex-col bg-fundo">
        {/* Sem a lista ao lado, o caminho de volta precisa existir na tela. */}
        <a
          href={`/inbox?filtro=${filtro}`}
          className="border-b border-borda bg-superficie px-4 py-2 text-[12px] text-acento lg:hidden"
        >
          ← Todas as conversas
        </a>
        <BarraDaConversa
          conversa={conversa}
          podeAssumir={temEscopo(sessao, "atendimento:assumir")}
          souOAtendente={souOAtendente}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 barra-fina">
          <Timeline mensagens={conversa.mensagens} />
        </div>

        {podeEscrever ? (
          <Composer conversaId={conversa.id} />
        ) : (
          <p className="border-t border-borda bg-superficie px-4 py-3 text-[12px] text-texto-suave">
            {encerrada
              ? "Conversa encerrada. Reabra para voltar a responder."
              : `Em atendimento com ${conversa.atendente?.nome ?? "outro atendente"}.`}
          </p>
        )}
      </section>

      {/* O contexto do contato é apoio: sai primeiro quando falta largura. */}
      <div className="hidden min-h-0 xl:grid">
        <PainelDoContato contato={conversa.cliente} conversaIniciadaEm={conversa.criadoEm} />
      </div>
    </div>
  );
}
