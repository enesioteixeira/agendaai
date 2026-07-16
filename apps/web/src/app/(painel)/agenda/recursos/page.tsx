import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { temEscopo } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { RecursoForm } from "@/modules/agenda/RecursoForm";
import { BloqueioForm } from "@/modules/agenda/BloqueioForm";
import { recursoAlternarAtivoAction, bloqueioExcluirAction } from "@/modules/agenda/actions";
import { tb, th, td, btSec } from "@/modules/agenda/estilos";

const TIPO_BLOQUEIO: Record<string, string> = {
  ferias: "Férias/folga",
  almoco: "Almoço",
  manutencao: "Manutenção",
  outro: "Outro",
};

export default async function RecursosPage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  const { recursos, bloqueios, unidades, profissionais } = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    async () => ({
      recursos: await prisma.recurso.findMany({ orderBy: { nome: "asc" }, include: { unidade: true } }),
      // bloqueios vigentes/futuros — os passados não interessam à operação
      bloqueios: await prisma.bloqueio.findMany({
        where: { fim: { gte: new Date() } },
        orderBy: { inicio: "asc" },
        include: { profissional: true, recurso: true, unidade: true },
      }),
      unidades: await prisma.unidade.findMany({ orderBy: { nome: "asc" } }),
      profissionais: await prisma.profissional.findMany({ where: { deletedAt: null, ativo: true }, orderBy: { nome: "asc" } }),
    }),
  );
  const podeConfigurar = temEscopo(sessao, "agenda:configurar");
  const opcoesUnidade = unidades.map((u) => ({ id: u.id, nome: u.nome }));
  // Datas em UTC no banco; apresentação no fuso da unidade (regra 16)
  const fuso = unidades[0]?.fusoHorario ?? "America/Sao_Paulo";

  const alvos = [
    ...profissionais.map((p) => ({ valor: `profissional:${p.id}`, rotulo: `Profissional — ${p.nome}` })),
    ...recursos.filter((r) => r.ativo).map((r) => ({ valor: `recurso:${r.id}`, rotulo: `Sala/recurso — ${r.nome}` })),
    ...unidades.map((u) => ({ valor: `unidade:${u.id}`, rotulo: `Unidade inteira — ${u.nome}` })),
  ];

  return (
    <div style={{ display: "grid", gap: "2rem", maxWidth: 950 }}>
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Salas, recursos & bloqueios</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Espaços físicos que a agenda reserva junto com o profissional — e os períodos em que algo (ou alguém) não atende.
        </p>
      </div>

      <section style={{ display: "grid", gap: "0.75rem" }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Salas & recursos</h2>
        {podeConfigurar && <RecursoForm unidades={opcoesUnidade} />}
        <table style={tb}>
          <thead>
            <tr>
              <th style={th}>Nome</th>
              <th style={th}>Unidade</th>
              <th style={th}>Tipo</th>
              <th style={th}>Status</th>
              {podeConfigurar && <th style={th} />}
            </tr>
          </thead>
          <tbody>
            {recursos.length === 0 && (
              <tr><td style={td} colSpan={5}>Nenhuma sala/recurso — opcional; cadastre se a agenda disputa espaço físico.</td></tr>
            )}
            {recursos.map((r) => (
              <tr key={r.id} style={r.ativo ? undefined : { opacity: 0.5 }}>
                <td style={td}>{r.nome}</td>
                <td style={td}>{r.unidade.nome}</td>
                <td style={td}>{r.tipo}</td>
                <td style={td}>{r.ativo ? "Ativo" : "Inativo"}</td>
                {podeConfigurar && (
                  <td style={{ ...td, display: "flex", gap: 6 }}>
                    <details>
                      <summary style={{ cursor: "pointer", fontSize: 13 }}>Editar</summary>
                      <div style={{ padding: "0.75rem 0" }}>
                        <RecursoForm
                          unidades={opcoesUnidade}
                          recurso={{ id: r.id, nome: r.nome, unidadeId: r.unidadeId, tipo: r.tipo, capacidade: r.capacidade }}
                        />
                      </div>
                    </details>
                    <form action={recursoAlternarAtivoAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="ativo" value={String(!r.ativo)} />
                      <button type="submit" style={{ ...btSec, padding: "0.2rem 0.5rem", fontSize: 13 }}>
                        {r.ativo ? "Desativar" : "Reativar"}
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ display: "grid", gap: "0.75rem" }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Bloqueios (vigentes e futuros)</h2>
        {podeConfigurar && alvos.length > 0 && <BloqueioForm alvos={alvos} />}
        <table style={tb}>
          <thead>
            <tr>
              <th style={th}>Alvo</th>
              <th style={th}>Tipo</th>
              <th style={th}>Período</th>
              <th style={th}>Motivo</th>
              {podeConfigurar && <th style={th} />}
            </tr>
          </thead>
          <tbody>
            {bloqueios.length === 0 && (
              <tr><td style={td} colSpan={5}>Nenhum bloqueio vigente.</td></tr>
            )}
            {bloqueios.map((b) => (
              <tr key={b.id}>
                <td style={td}>
                  {b.profissional?.nome ?? b.recurso?.nome ?? `Unidade — ${b.unidade?.nome ?? ""}`}
                </td>
                <td style={td}>{TIPO_BLOQUEIO[b.tipo] ?? b.tipo}</td>
                <td style={td}>
                  {b.inicio.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: fuso })}
                  {" → "}
                  {b.fim.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: fuso })}
                </td>
                <td style={td}>{b.motivo ?? "—"}</td>
                {podeConfigurar && (
                  <td style={td}>
                    <form action={bloqueioExcluirAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <button type="submit" style={{ ...btSec, padding: "0.2rem 0.5rem", fontSize: 13 }}>
                        Excluir
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
