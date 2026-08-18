import { redirect } from "next/navigation";

import { dentroDoExpediente, proximaAberturaDoExpediente } from "@atende/core";
import { listarFilas, prisma, runWithTenant } from "@atende/db";
import { Badge, EstadoVazio } from "@atende/ui";

import { BotaoArquivar } from "@/modules/atendimento/BotaoArquivar";
import { FormFila } from "@/modules/atendimento/FormFila";
import { MembrosDaFila, type UsuarioDaEmpresa } from "@/modules/atendimento/MembrosDaFila";
import { arquivarFilaAction } from "@/modules/atendimento/configuracao-actions";
import { lerHorarioParaFormulario } from "@/modules/atendimento/schemas";
import {
  DISTRIBUICOES,
  formatarMinutos,
  formatarNoFuso,
} from "@/modules/atendimento/vocabulario";
import { lerSessao } from "@/lib/sessao";

// "Aberta agora" depende do relógio: com a página em cache estático, a fila
// apareceria aberta às 3h da manhã porque o build foi às 10h.
export const dynamic = "force-dynamic";

function rotuloDaDistribuicao(valor: string): string {
  return DISTRIBUICOES.find((d) => d.valor === valor)?.rotulo ?? valor;
}

/**
 * Filas de atendimento — a tela que decide para onde a conversa vai.
 *
 * A SITUAÇÃO É CALCULADA, não guardada: `dentroDoExpediente` responde se a fila
 * está aberta AGORA e `proximaAberturaDoExpediente` diz quando abre. As duas são
 * as mesmas funções que o roteador do worker usa — se a tela dissesse "aberta" a
 * partir de uma regra própria, o dia em que as duas divergissem seria o dia em
 * que ninguém acreditaria mais no painel.
 *
 * Filas arquivadas continuam na lista, esmaecidas: a fila some da entrada, mas
 * as conversas antigas continuam apontando para ela, e esconder o registro faria
 * o relatório citar uma fila que a configuração jura não existir.
 */
export default async function FilasPage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  const { filas, usuarios } = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    async () => ({
      filas: await listarFilas({ incluirArquivadas: true }),
      // Candidatos a membro são os VÍNCULOS ativos desta empresa, não a tabela
      // `Usuario` — que é model global e, por isso, não é filtrada pela extension
      // de tenancy. Ler `Usuario` direto aqui ofereceria gente de outro tenant
      // no seletor.
      usuarios: await prisma.vinculoUsuarioEmpresa.findMany({
        where: { ativo: true },
        select: {
          usuarioId: true,
          usuario: { select: { nome: true, email: true } },
          papel: { select: { nome: true } },
        },
        orderBy: { usuario: { nome: "asc" } },
      }),
    }),
  );

  const equipe: UsuarioDaEmpresa[] = usuarios.map((v) => ({
    usuarioId: v.usuarioId,
    nome: v.usuario.nome,
    email: v.usuario.email,
    papel: v.papel.nome,
  }));

  const agora = new Date();

  return (
    <div className="flex flex-col gap-5">
      {filas.length === 0 ? (
        <EstadoVazio
          icone="pessoas"
          titulo="Nenhuma fila ainda"
          descricao="Crie a primeira abaixo. Sem fila, toda conversa chega num monte só e o prazo de resposta não tem a quem cobrar."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {filas.map((fila) => {
            const expediente = lerHorarioParaFormulario(fila.horarioJson);
            const aberta = dentroDoExpediente(agora, fila.horarioJson);
            const proxima = proximaAberturaDoExpediente(agora, fila.horarioJson);
            const membrosAtivos = fila.membros.filter((m) => m.ativo);

            return (
              <li
                key={fila.id}
                className={`flex flex-col gap-3 rounded-2 border border-borda bg-superficie p-4 ${
                  fila.ativa ? "" : "opacity-60"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{fila.nome}</h2>

                  {!fila.ativa ? (
                    <Badge tom="neutro">arquivada</Badge>
                  ) : expediente === null ? (
                    <Badge tom="info">24 horas</Badge>
                  ) : aberta ? (
                    <Badge tom="sucesso">aberta agora</Badge>
                  ) : (
                    <Badge tom="atencao">fora do horário</Badge>
                  )}

                  {fila.ativa ? (
                    <BotaoArquivar
                      id={fila.id}
                      acao={arquivarFilaAction}
                      titulo={`Arquivar a fila "${fila.nome}"?`}
                      explicacao="Ela sai do roteamento e dos seletores da inbox. As conversas que já passaram por ela continuam registradas na fila, para o relatório não mudar de resposta."
                      rotulo="Arquivar"
                      rotuloConfirmar="Arquivar fila"
                    />
                  ) : null}
                </div>

                {fila.descricao ? (
                  <p className="text-[12px] text-texto-suave">{fila.descricao}</p>
                ) : null}

                <dl className="grid gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="text-texto-fraco">Distribuição</dt>
                    <dd className="text-texto-suave">{rotuloDaDistribuicao(fila.distribuicao)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-texto-fraco">1ª resposta</dt>
                    <dd className="text-texto-suave">
                      {formatarMinutos(fila.prazoPrimeiraRespostaMin)}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-texto-fraco">Resolução</dt>
                    <dd className="text-texto-suave">{formatarMinutos(fila.prazoResolucaoMin)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-texto-fraco">Equipe</dt>
                    <dd className="min-w-0 text-texto-suave">
                      {membrosAtivos.length === 0
                        ? "ninguém"
                        : membrosAtivos.map((m) => m.nome).join(", ")}
                    </dd>
                  </div>
                  {expediente !== null && !aberta && proxima !== null ? (
                    <div className="flex gap-2 sm:col-span-2">
                      <dt className="text-texto-fraco">Abre</dt>
                      <dd className="text-texto-suave">
                        {formatarNoFuso(proxima, expediente.fuso)} ({expediente.fuso})
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <div className="flex flex-col gap-2 border-t border-borda pt-3">
                  <details>
                    <summary className="cursor-pointer text-[13px] text-acento">
                      Editar fila
                    </summary>
                    <div className="pt-3">
                      <FormFila
                        fila={{
                          id: fila.id,
                          nome: fila.nome,
                          descricao: fila.descricao,
                          distribuicao: fila.distribuicao,
                          prazoPrimeiraRespostaMin: fila.prazoPrimeiraRespostaMin,
                          prazoResolucaoMin: fila.prazoResolucaoMin,
                          mensagemForaHorario: fila.mensagemForaHorario,
                          expediente,
                        }}
                      />
                    </div>
                  </details>

                  <details>
                    <summary className="cursor-pointer text-[13px] text-acento">
                      Quem atende ({membrosAtivos.length})
                    </summary>
                    <div className="pt-3">
                      <MembrosDaFila
                        filaId={fila.id}
                        usuarios={equipe}
                        selecionados={membrosAtivos.map((m) => m.usuarioId)}
                        distribuicao={fila.distribuicao}
                      />
                    </div>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="flex flex-col gap-3 rounded-2 border border-borda bg-superficie p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-texto-fraco">
          Nova fila
        </h2>
        <FormFila />
      </section>
    </div>
  );
}
