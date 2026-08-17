import { redirect } from "next/navigation";

import { temEscopo } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { Badge, EstadoVazio, formatarData, formatarTelefone } from "@atende/ui";

import { Listagem } from "@/componentes/Listagem";
import { ClienteForm } from "@/modules/agenda/ClienteForm";
import { lerSessao } from "@/lib/sessao";

// Clientes — versão mínima do Bloco 2 (cadastro p/ agendar). O módulo completo
// (IdentidadeCanal, timeline, tags, merge) chega com o omnichannel.
export default async function ClientesPage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  if (!temEscopo(sessao, "clientes:ler")) {
    return (
      <div className="p-4 md:p-6">
        <EstadoVazio
          icone="escudo"
          titulo="Sem acesso a contatos"
          descricao="Seu papel não tem o escopo clientes:ler. Peça a um administrador."
        />
      </div>
    );
  }

  const clientes = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    () =>
      prisma.cliente.findMany({
        where: { deletedAt: null },
        orderBy: { nome: "asc" },
        take: 500,
        include: { agendamentos: { orderBy: { inicio: "desc" }, take: 1 } },
      }),
  );
  const podeCriar = temEscopo(sessao, "clientes:criar");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      <header>
        <h1 className="text-[19px] font-semibold tracking-tight">Contatos</h1>
        <p className="mt-1 text-[13px] text-texto-suave">
          Quem já falou com você. Contatos criados pela conversa entram aqui como
          provisórios — o nome vem do perfil do WhatsApp, não de um cadastro conferido.
        </p>
      </header>

      {podeCriar ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-texto-fraco">
            Novo contato
          </h2>
          <ClienteForm />
        </section>
      ) : null}

      <section>
        <Listagem
          linhas={clientes}
          chaveDaLinha={(c) => c.id}
          vazioIcone="pessoas"
          vazioTitulo="Nenhum contato ainda"
          vazioDescricao="Assim que alguém escrever num canal conectado, o contato aparece aqui."
          colunas={[
            {
              chave: "nome",
              rotulo: "Nome",
              principal: true,
              conteudo: (c) => (
                <span className="flex flex-wrap items-center gap-1.5">
                  {c.nome}
                  {c.provisorio ? (
                    <Badge tom="neutro" semPonto title="Criado pela conversa, sem cadastro conferido">
                      provisório
                    </Badge>
                  ) : null}
                </span>
              ),
            },
            {
              chave: "telefone",
              rotulo: "Telefone",
              conteudo: (c) => (c.telefone ? formatarTelefone(c.telefone) : "—"),
            },
            { chave: "email", rotulo: "E-mail", conteudo: (c) => c.email ?? "—" },
            {
              chave: "ultimo",
              rotulo: "Último agendamento",
              soDesktop: true,
              conteudo: (c) => (c.agendamentos[0] ? formatarData(c.agendamentos[0].inicio) : "—"),
            },
          ]}
        />
      </section>
    </div>
  );
}
