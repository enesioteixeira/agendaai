import { redirect } from "next/navigation";

import { listarEtiquetas, listarMotivosEncerramento, runWithTenant } from "@atende/db";
import { Badge, EstadoVazio } from "@atende/ui";

import { BotaoArquivar } from "@/modules/atendimento/BotaoArquivar";
import { FormEtiqueta, FormMotivo } from "@/modules/atendimento/FormsDoCatalogo";
import {
  arquivarEtiquetaAction,
  arquivarMotivoAction,
} from "@/modules/atendimento/configuracao-actions";
import { CORES_DE_ETIQUETA, type CorDeEtiqueta } from "@/modules/atendimento/vocabulario";
import { lerSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

const CORES_VALIDAS = new Set<string>(CORES_DE_ETIQUETA.map((c) => c.valor));

/**
 * Cor gravada → tom do `Badge`.
 *
 * Etiqueta antiga pode ter cor que não está mais na lista (ou nenhuma), e o
 * `Badge` só aceita os cinco tons. Cair em "neutro" é o que impede que um valor
 * de banco derrube a renderização da tela inteira por causa de uma etiqueta.
 */
function tomDaEtiqueta(cor: string | null): CorDeEtiqueta {
  return cor !== null && CORES_VALIDAS.has(cor) ? (cor as CorDeEtiqueta) : "neutro";
}

/**
 * Motivos de encerramento e etiquetas — a taxonomia do tenant.
 *
 * As duas listas moram na mesma tela porque respondem à mesma pergunta ("como
 * esta empresa classifica as conversas dela") e porque cada uma tem dois campos:
 * separá-las daria duas telas quase vazias e um clique a mais para configurar o
 * que se configura de uma vez, no primeiro dia.
 *
 * A lista mostra os ARQUIVADOS junto, esmaecidos. É deliberado: o motivo de
 * encerramento é a legenda do relatório, e alguém que abre esta tela procurando
 * "Sem estoque" precisa descobrir que ele foi arquivado — não que ele nunca
 * existiu.
 */
export default async function CatalogosPage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  const { motivos, etiquetas } = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    async () => ({
      motivos: await listarMotivosEncerramento({ incluirArquivados: true }),
      etiquetas: await listarEtiquetas({ incluirArquivadas: true }),
    }),
  );

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <section className="flex flex-col gap-3 rounded-2 border border-borda bg-superficie p-4">
        <header className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">Motivos de encerramento</h2>
          <p className="text-[12px] leading-relaxed text-texto-suave">
            Escolhidos ao fechar a conversa. São eles que transformam a inbox em relatório: sem
            motivo, no mês seguinte ninguém sabe por que as conversas terminaram.
          </p>
        </header>

        {motivos.length === 0 ? (
          <EstadoVazio
            icone="etiqueta"
            titulo="Nenhum motivo cadastrado"
            descricao="Comece com três ou quatro: pedido fechado, só cotação, sem estoque, desistiu."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-borda/60">
            {motivos.map((motivo) => (
              <li
                key={motivo.id}
                className={`flex items-center gap-2 py-2 ${motivo.ativo ? "" : "opacity-60"}`}
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">{motivo.nome}</span>
                {motivo.ativo ? (
                  <BotaoArquivar
                    id={motivo.id}
                    acao={arquivarMotivoAction}
                    titulo={`Arquivar "${motivo.nome}"?`}
                    explicacao="Ele sai do menu de encerramento. As conversas já encerradas com este motivo continuam contando por ele no relatório."
                    rotuloConfirmar="Arquivar motivo"
                  />
                ) : (
                  <Badge tom="neutro">arquivado</Badge>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-borda pt-3">
          <FormMotivo />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2 border border-borda bg-superficie p-4">
        <header className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">Etiquetas</h2>
          <p className="text-[12px] leading-relaxed text-texto-suave">
            Corte livre da conversa, aplicado durante o atendimento — usado depois para filtrar a
            inbox e recortar relatório.
          </p>
        </header>

        {etiquetas.length === 0 ? (
          <EstadoVazio
            icone="etiqueta"
            titulo="Nenhuma etiqueta cadastrada"
            descricao="Ex.: cliente novo, urgente, orçamento grande, atraso na entrega."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-borda/60">
            {etiquetas.map((etiqueta) => (
              <li
                key={etiqueta.id}
                className={`flex items-center gap-2 py-2 ${etiqueta.ativa ? "" : "opacity-60"}`}
              >
                <span className="min-w-0 flex-1">
                  <Badge tom={tomDaEtiqueta(etiqueta.cor)}>{etiqueta.nome}</Badge>
                </span>
                {etiqueta.ativa ? (
                  <BotaoArquivar
                    id={etiqueta.id}
                    acao={arquivarEtiquetaAction}
                    titulo={`Arquivar "${etiqueta.nome}"?`}
                    explicacao="Ela deixa de ser aplicada em conversa nova. As conversas que já a receberam continuam com ela, e o filtro do histórico continua achando."
                    rotuloConfirmar="Arquivar etiqueta"
                  />
                ) : (
                  <Badge tom="neutro">arquivada</Badge>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-borda pt-3">
          <FormEtiqueta />
        </div>
      </section>
    </div>
  );
}
