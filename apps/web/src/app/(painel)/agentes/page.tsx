import { redirect } from "next/navigation";

import { temEscopo } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { Badge, EstadoVazio, formatarDataHora } from "@atende/ui";

import { FormEditarVersao, FormNovoAgente } from "@/modules/agentes/FormAgente";
import { alternarAgenteAction, publicarVersaoAction } from "@/modules/agentes/actions";
import { lerSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

export default async function AgentesPage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  if (!temEscopo(sessao, "config:canais")) {
    return (
      <div className="p-6">
        <EstadoVazio
          icone="escudo"
          titulo="Sem acesso"
          descricao="Seu papel não configura agentes. Peça a um administrador o escopo config:canais."
        />
      </div>
    );
  }

  const agentes = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    () =>
      prisma.agenteIA.findMany({
        where: { deletedAt: null },
        orderBy: { criadoEm: "asc" },
        include: { versoes: { orderBy: { numero: "desc" } } },
      }),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      <header>
        <h1 className="text-[19px] font-semibold tracking-tight">Agentes de IA</h1>
        <p className="mt-1 text-[13px] text-texto-suave">
          Um agente atende no seu lugar quando ninguém está disponível. Você escreve quem ele é;
          ele responde dentro desse papel.{" "}
          <strong className="font-semibold text-texto">Publicar congela a versão</strong> — quem já
          está conversando termina com a persona com que começou.
        </p>
      </header>

      {agentes.length === 0 ? (
        <EstadoVazio
          icone="agente"
          titulo="Nenhum agente ainda"
          descricao="Crie o primeiro abaixo. Ele nasce em rascunho e não atende ninguém até você publicar."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {agentes.map((a) => {
            const rascunho = a.versoes.find((v) => v.status === "rascunho");
            const publicada = a.versoes.find((v) => v.status === "publicada");
            const emEdicao = rascunho ?? publicada;

            return (
              <li key={a.id} className="rounded-2 border border-borda bg-superficie">
                <div className="flex flex-wrap items-center gap-3 border-b border-borda px-4 py-3">
                  <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{a.nome}</h2>

                  {publicada ? (
                    <Badge tom="sucesso">no ar · v{publicada.numero}</Badge>
                  ) : (
                    <Badge tom="neutro">nunca publicado</Badge>
                  )}
                  {a.ativo ? null : <Badge tom="atencao">desligado</Badge>}

                  <form action={alternarAgenteAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="ativar" value={a.ativo ? "0" : "1"} />
                    <button type="submit" className="ie-botao">
                      {a.ativo ? "Desligar" : "Ligar"}
                    </button>
                  </form>
                </div>

                <div className="flex flex-col gap-3 px-4 py-3">
                  {emEdicao ? (
                    <>
                      <div className="flex items-center gap-2 text-[11px] text-texto-fraco">
                        <span>
                          Editando v{emEdicao.numero}
                          {emEdicao.status === "rascunho" ? " (rascunho)" : " (publicada)"}
                        </span>
                        {publicada?.publicadaEm ? (
                          <span>· publicada em {formatarDataHora(publicada.publicadaEm)}</span>
                        ) : null}
                      </div>

                      <FormEditarVersao
                        versaoId={emEdicao.id}
                        persona={emEdicao.persona}
                        provedor={emEdicao.provedor}
                        publicada={emEdicao.status !== "rascunho"}
                      />

                      {emEdicao.status === "rascunho" ? (
                        <form action={publicarVersaoAction}>
                          <input type="hidden" name="versaoId" value={emEdicao.id} />
                          <button type="submit" className="ie-botao ie-botao--primario">
                            Publicar v{emEdicao.numero}
                          </button>
                        </form>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-texto-fraco">
          Novo agente
        </h2>
        <FormNovoAgente />
      </section>

      {/* Honestidade sobre o que ainda não existe: o agente é configurável, mas
          o motor que o faz responder numa conversa real é a próxima etapa.
          Deixar isso implícito faria o usuário publicar e esperar em vão. */}
      <p className="rounded-2 border border-borda bg-superficie-2 p-3 text-[12px] leading-relaxed text-texto-suave">
        <strong className="font-semibold text-texto">Em construção:</strong> a persona já fica
        gravada e versionada, mas o agente ainda não responde sozinho nas conversas — falta ligar o
        motor ao canal, e a chave do provedor de IA precisa ser configurada. Enquanto isso, o
        atendimento segue humano pela Inbox.
      </p>
    </div>
  );
}
