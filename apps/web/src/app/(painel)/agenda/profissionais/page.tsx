import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { temEscopo } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { ProfissionalForm } from "@/modules/agenda/ProfissionalForm";
import { GradeHorariosForm } from "@/modules/agenda/GradeHorariosForm";
import {
  profissionalAlternarAtivoAction,
  horariosTrabalhoSalvarAction,
} from "@/modules/agenda/actions";
import { tb, th, td, btSec, DIAS_SEMANA } from "@/modules/agenda/estilos";

export default async function ProfissionaisPage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  const { profissionais, unidades } = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    async () => ({
      profissionais: await prisma.profissional.findMany({
        where: { deletedAt: null },
        orderBy: { nome: "asc" },
        include: { horarios: { orderBy: [{ diaSemana: "asc" }, { horaInicio: "asc" }] }, unidade: true },
      }),
      unidades: await prisma.unidade.findMany({ orderBy: { nome: "asc" } }),
    }),
  );
  const podeConfigurar = temEscopo(sessao, "agenda:configurar");
  const opcoesUnidade = unidades.map((u) => ({ id: u.id, nome: u.nome }));

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Profissionais</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Quem atende — cada um com sua grade semanal de horários (a booking só oferece horários dentro da grade).
        </p>
      </div>

      {podeConfigurar && (
        <section>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Novo profissional</h2>
          <ProfissionalForm unidades={opcoesUnidade} />
        </section>
      )}

      <section>
        <table style={tb}>
          <thead>
            <tr>
              <th style={th}>Profissional</th>
              <th style={th}>Unidade</th>
              <th style={th}>Grade semanal</th>
              <th style={th}>Status</th>
              {podeConfigurar && <th style={th} />}
            </tr>
          </thead>
          <tbody>
            {profissionais.length === 0 && (
              <tr><td style={td} colSpan={5}>Nenhum profissional ainda — cadastre o primeiro acima.</td></tr>
            )}
            {profissionais.map((p) => (
              <tr key={p.id} style={p.ativo ? undefined : { opacity: 0.5 }}>
                <td style={td}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: p.cor ?? "#999", marginRight: 6 }} />
                  {p.nome}
                </td>
                <td style={td}>{p.unidade.nome}</td>
                <td style={td}>
                  {p.horarios.length === 0
                    ? "Sem grade definida"
                    : p.horarios.map((h) => `${DIAS_SEMANA[h.diaSemana]} ${h.horaInicio}–${h.horaFim}`).join(" · ")}
                </td>
                <td style={td}>{p.ativo ? "Ativo" : "Inativo"}</td>
                {podeConfigurar && (
                  <td style={{ ...td, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <details>
                      <summary style={{ cursor: "pointer", fontSize: 13 }}>Editar</summary>
                      <div style={{ padding: "0.75rem 0" }}>
                        <ProfissionalForm
                          unidades={opcoesUnidade}
                          profissional={{ id: p.id, nome: p.nome, unidadeId: p.unidadeId, cor: p.cor }}
                        />
                      </div>
                    </details>
                    <details>
                      <summary style={{ cursor: "pointer", fontSize: 13 }}>Grade de horários</summary>
                      <div style={{ padding: "0.75rem 0" }}>
                        <GradeHorariosForm
                          action={horariosTrabalhoSalvarAction}
                          camposOcultos={{ profissionalId: p.id, unidadeId: p.unidadeId }}
                          intervalosIniciais={p.horarios.map((h) => ({
                            diaSemana: h.diaSemana,
                            horaInicio: h.horaInicio,
                            horaFim: h.horaFim,
                          }))}
                        />
                      </div>
                    </details>
                    <form action={profissionalAlternarAtivoAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="ativo" value={String(!p.ativo)} />
                      <button type="submit" style={{ ...btSec, padding: "0.2rem 0.5rem", fontSize: 13 }}>
                        {p.ativo ? "Desativar" : "Reativar"}
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
