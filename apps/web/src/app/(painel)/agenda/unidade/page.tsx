import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { temEscopo } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { GradeHorariosForm, type Intervalo } from "@/modules/agenda/GradeHorariosForm";
import { horariosFuncionamentoSalvarAction } from "@/modules/agenda/actions";

// Horários de funcionamento por unidade (doc 04 §2.3). Persistem no Json
// Unidade.horariosFuncionamento como lista de intervalos {diaSemana, horaInicio, horaFim}.
export default async function UnidadePage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  const unidades = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    () => prisma.unidade.findMany({ orderBy: { nome: "asc" } }),
  );

  if (!temEscopo(sessao, "agenda:configurar")) {
    return (
      <div>
        <h1 style={{ fontSize: 22 }}>Horário de funcionamento</h1>
        <p style={{ color: "#c0362c" }}>Seu papel não pode configurar a agenda (escopo agenda:configurar).</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "2rem", maxWidth: 720 }}>
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Horário de funcionamento</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Quando cada unidade abre — a booking pública nunca oferece horário fora do funcionamento.
        </p>
      </div>

      {unidades.map((u) => {
        const intervalos = Array.isArray(u.horariosFuncionamento)
          ? (u.horariosFuncionamento as unknown as Intervalo[])
          : [];
        return (
          <section key={u.id} style={{ display: "grid", gap: 8 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>{u.nome}</h2>
            <GradeHorariosForm
              action={horariosFuncionamentoSalvarAction}
              camposOcultos={{ unidadeId: u.id }}
              intervalosIniciais={intervalos}
              rotuloSalvar="Salvar funcionamento"
            />
          </section>
        );
      })}
    </div>
  );
}
