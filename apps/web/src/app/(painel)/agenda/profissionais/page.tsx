import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { temEscopo } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { ProfissionalForm } from "@/modules/agenda/ProfissionalForm";
import { GradeHorariosForm } from "@/modules/agenda/GradeHorariosForm";
import {
  profissionalAlternarAtivoAction,
  horariosTrabalhoSalvarAction,
  gcalDesconectarAction,
} from "@/modules/agenda/actions";
import { tb, th, td, btSec, DIAS_SEMANA } from "@/modules/agenda/estilos";

const GCAL_AVISO: Record<string, string> = {
  ok: "Google Calendar conectado — horários ocupados já bloqueiam a agenda.",
  "erro-state": "A conexão expirou ou foi adulterada — tente conectar de novo.",
  "erro-config": "Integração Google ainda não configurada no servidor.",
  "erro-troca": "O Google recusou a autorização — tente de novo.",
  "erro-sem-refresh": "O Google não devolveu a credencial — remova o acesso em myaccount.google.com/permissions e conecte de novo.",
};

export default async function ProfissionaisPage({
  searchParams,
}: {
  searchParams: Promise<{ gcal?: string }>;
}) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");
  const { gcal } = await searchParams;

  const { profissionais, unidades } = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    async () => ({
      profissionais: await prisma.profissional.findMany({
        where: { deletedAt: null },
        orderBy: { nome: "asc" },
        include: {
          horarios: { orderBy: [{ diaSemana: "asc" }, { horaInicio: "asc" }] },
          unidade: true,
          sincronizacao: true,
        },
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

      {gcal && (
        <p style={{ margin: 0, padding: "0.6rem 0.9rem", borderRadius: 8, fontSize: 14, background: gcal === "ok" ? "#e8f0e8" : "#fdecea", color: gcal === "ok" ? "#2c7a2c" : "#c0362c" }}>
          {GCAL_AVISO[gcal] ?? "Falha ao conectar o Google Calendar."}
        </p>
      )}

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
              <th style={th}>Google Calendar</th>
              <th style={th}>Status</th>
              {podeConfigurar && <th style={th} />}
            </tr>
          </thead>
          <tbody>
            {profissionais.length === 0 && (
              <tr><td style={td} colSpan={6}>Nenhum profissional ainda — cadastre o primeiro acima.</td></tr>
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
                <td style={td}>
                  {(() => {
                    const s = p.sincronizacao;
                    if (!s || s.estadoSync === "desconectado") {
                      return podeConfigurar ? (
                        <a href={`/api/gcal/conectar?profissionalId=${p.id}`} style={{ color: "#4f7cff", fontSize: 13 }}>Conectar</a>
                      ) : (
                        "—"
                      );
                    }
                    if (s.estadoSync === "erro_token") {
                      return (
                        <span style={{ color: "#c0362c", fontSize: 13 }}>
                          Acesso expirou{" "}
                          {podeConfigurar && <a href={`/api/gcal/conectar?profissionalId=${p.id}`} style={{ color: "#4f7cff" }}>reconectar</a>}
                        </span>
                      );
                    }
                    return (
                      <span style={{ fontSize: 13 }}>
                        ✓ Conectado
                        {s.ultimaSyncEm && ` · sync ${s.ultimaSyncEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                        {podeConfigurar && (
                          <form action={gcalDesconectarAction} style={{ display: "inline", marginLeft: 6 }}>
                            <input type="hidden" name="profissionalId" value={p.id} />
                            <button type="submit" style={{ background: "none", border: "none", color: "#c0362c", cursor: "pointer", fontSize: 12, padding: 0 }}>
                              desconectar
                            </button>
                          </form>
                        )}
                      </span>
                    );
                  })()}
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
