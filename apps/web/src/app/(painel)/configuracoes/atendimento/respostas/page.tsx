import { redirect } from "next/navigation";

import { listarFilas, listarRespostasRapidas, runWithTenant } from "@atende/db";
import { Badge, EstadoVazio } from "@atende/ui";

import { BotaoArquivar } from "@/modules/atendimento/BotaoArquivar";
import { FormRespostaRapida, type OpcaoDeFila } from "@/modules/atendimento/FormRespostaRapida";
import { arquivarRespostaRapidaAction } from "@/modules/atendimento/configuracao-actions";
import { lerSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * Respostas rápidas — o que o time responde sem redigitar.
 *
 * A LISTA MOSTRA O TEXTO INTEIRO, não um resumo de uma linha. Resposta rápida é
 * o que sai no nome da empresa para o cliente: quem revisa esta tela está
 * conferindo o TEXTO, e um recorte com reticências esconde justamente o fim da
 * frase, que é onde mora o compromisso ("em até 2 dias úteis").
 *
 * As filas vêm da lista ATIVA (`listarFilas()` sem `incluirArquivadas`): oferecer
 * uma fila arquivada no seletor seria oferecer restringir a resposta a uma fila
 * que não recebe mais conversa — a resposta sumiria do composer sem explicação.
 */
export default async function RespostasRapidasPage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  const { respostas, filas } = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    async () => ({
      respostas: await listarRespostasRapidas(null, { incluirArquivadas: true }),
      filas: await listarFilas(),
    }),
  );

  const opcoes: OpcaoDeFila[] = filas.map((f) => ({ id: f.id, nome: f.nome }));
  const nomeDaFila = new Map(filas.map((f) => [f.id, f.nome]));

  return (
    <div className="flex flex-col gap-5">
      {respostas.length === 0 ? (
        <EstadoVazio
          icone="conversa"
          titulo="Nenhuma resposta rápida ainda"
          descricao="Comece pelas três perguntas que o seu time responde todo dia: prazo de entrega, forma de pagamento e pedido mínimo."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {respostas.map((resposta) => (
            <li
              key={resposta.id}
              className={`flex flex-col gap-2 rounded-2 border border-borda bg-superficie p-4 ${
                resposta.ativa ? "" : "opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-2 bg-superficie-2 px-1.5 py-0.5 text-[12px] text-acento">
                  /{resposta.atalho}
                </code>
                <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                  {resposta.titulo}
                </h2>

                {resposta.filaId === null ? (
                  <Badge tom="neutro">todas as filas</Badge>
                ) : (
                  <Badge tom="info">
                    {nomeDaFila.get(resposta.filaId) ?? "fila arquivada"}
                  </Badge>
                )}

                {resposta.ativa ? (
                  <BotaoArquivar
                    id={resposta.id}
                    acao={arquivarRespostaRapidaAction}
                    titulo={`Arquivar "/${resposta.atalho}"?`}
                    explicacao="A resposta sai do atendimento e o atalho volta a ficar livre. O texto continua guardado."
                    rotuloConfirmar="Arquivar resposta"
                  />
                ) : (
                  <Badge tom="neutro">arquivada</Badge>
                )}
              </div>

              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-texto-suave">
                {resposta.texto}
              </p>

              {resposta.ativa ? (
                <details className="border-t border-borda pt-2">
                  <summary className="cursor-pointer text-[13px] text-acento">Editar</summary>
                  <div className="pt-3">
                    <FormRespostaRapida
                      resposta={{
                        id: resposta.id,
                        atalho: resposta.atalho,
                        titulo: resposta.titulo,
                        texto: resposta.texto,
                        filaId: resposta.filaId,
                      }}
                      filas={opcoes}
                    />
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-3 rounded-2 border border-borda bg-superficie p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-texto-fraco">
          Nova resposta rápida
        </h2>
        <FormRespostaRapida filas={opcoes} />
      </section>
    </div>
  );
}
