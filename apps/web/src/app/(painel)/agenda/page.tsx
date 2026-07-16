import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import {
  temEscopo,
  paraUtc,
  horaNoFuso,
  dataNoFuso,
  adicionarDias,
  diaDaSemana,
  linhasDaGrade,
} from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { AgendamentoForm } from "@/modules/agenda/AgendamentoForm";
import { agendamentoStatusAction } from "@/modules/agenda/actions";
import { DIAS_SEMANA } from "@/modules/agenda/estilos";

// Grade da agenda (B3): visão DIA (colunas por profissional) e SEMANA (um
// profissional, colunas por dia). Slots de 30 min, 07:00–21:00, no fuso da
// unidade. A grade só APRESENTA — quem decide conflito é o banco (doc 02 §3.1).

const LINHAS = linhasDaGrade(7, 21, 30);
const SLOT_MIN = 30;

interface Chip {
  id: string;
  rotulo: string;
  cor: string;
  status: string;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; visao?: string; profissionalId?: string }>;
}) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");
  const params = await searchParams;

  const dados = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    async () => {
      const unidades = await prisma.unidade.findMany({ orderBy: { nome: "asc" } });
      const fuso = unidades[0]?.fusoHorario ?? "America/Sao_Paulo";
      const data = params.data ?? dataNoFuso(new Date(), fuso);
      const visao = params.visao === "semana" ? "semana" : "dia";

      // Profissional (papel) sem agenda:cancelar enxerga só a própria agenda —
      // regra de aplicação da matriz doc 02 §13 ("própria agenda").
      const proprio = !temEscopo(sessao, "agenda:cancelar")
        ? await prisma.profissional.findFirst({
            where: { usuarioId: sessao.usuarioId, deletedAt: null },
          })
        : null;

      const profissionais = await prisma.profissional.findMany({
        where: { deletedAt: null, ativo: true, ...(proprio ? { id: proprio.id } : {}) },
        orderBy: { nome: "asc" },
      });

      const profissionalSemana =
        profissionais.find((p) => p.id === params.profissionalId) ?? profissionais[0];

      // Período consultado: o dia, ou a semana (dom→sáb) que contém a data
      const inicioDataStr = visao === "dia" ? data : adicionarDias(data, -diaDaSemana(data));
      const dias = visao === "dia" ? 1 : 7;
      const inicioUtc = paraUtc(inicioDataStr, "00:00", fuso);
      const fimUtc = paraUtc(adicionarDias(inicioDataStr, dias - 1), "23:59", fuso);

      const [agendamentos, bloqueios, servicos, clientes] = await Promise.all([
        prisma.agendamento.findMany({
          where: {
            inicio: { lte: fimUtc },
            fim: { gte: inicioUtc },
            status: { in: ["agendado", "confirmado", "em_atendimento", "concluido"] },
            ...(visao === "semana" && profissionalSemana
              ? { profissionalId: profissionalSemana.id }
              : {}),
          },
          include: { cliente: true, servico: true, profissional: true },
          orderBy: { inicio: "asc" },
        }),
        prisma.bloqueio.findMany({ where: { inicio: { lte: fimUtc }, fim: { gte: inicioUtc } } }),
        prisma.servico.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
        prisma.cliente.findMany({ where: { deletedAt: null }, orderBy: { nome: "asc" }, take: 200 }),
      ]);

      return {
        fuso,
        data,
        visao,
        profissionais,
        profissionalSemana,
        inicioDataStr,
        agendamentos,
        bloqueios,
        servicos,
        clientes,
      };
    },
  );

  const {
    fuso,
    data,
    visao,
    profissionais,
    profissionalSemana,
    inicioDataStr,
    agendamentos,
    bloqueios,
    servicos,
    clientes,
  } = dados;
  const podeCriar = temEscopo(sessao, "agenda:criar");
  const podeCancelar = temEscopo(sessao, "agenda:cancelar");

  // Colunas: dia → um profissional por coluna; semana → 7 dias de um profissional
  const colunas =
    visao === "dia"
      ? profissionais.map((p) => ({ chave: p.id, titulo: p.nome, dataCol: data, profissionalId: p.id }))
      : Array.from({ length: 7 }, (_, i) => {
          const d = adicionarDias(inicioDataStr, i);
          return {
            chave: d,
            titulo: `${DIAS_SEMANA[i]} ${d.slice(8)}/${d.slice(5, 7)}`,
            dataCol: d,
            profissionalId: profissionalSemana?.id ?? "",
          };
        });

  // Mapa (coluna|slot) → chips de agendamento que INICIAM naquele slot
  const chips = new Map<string, Chip[]>();
  for (const a of agendamentos) {
    const dataA = dataNoFuso(a.inicio, fuso);
    if (visao === "dia" && dataA !== data) continue;
    const horaA = horaNoFuso(a.inicio, fuso);
    const minutos = Number(horaA.slice(0, 2)) * 60 + Number(horaA.slice(3));
    const slotMin = Math.floor(minutos / SLOT_MIN) * SLOT_MIN;
    const slot = `${String(Math.floor(slotMin / 60)).padStart(2, "0")}:${String(slotMin % 60).padStart(2, "0")}`;
    const chaveCol = visao === "dia" ? a.profissionalId : dataA;
    const chave = `${chaveCol}|${slot}`;
    const lista = chips.get(chave) ?? [];
    lista.push({
      id: a.id,
      rotulo: `${horaA}–${horaNoFuso(a.fim, fuso)} ${a.cliente.nome} · ${a.servico.nome}`,
      cor: a.profissional.cor ?? "#4f7cff",
      status: a.status,
    });
    chips.set(chave, lista);
  }

  const unidadePorProfissional = new Map(profissionais.map((p) => [p.id, p.unidadeId]));

  function slotBloqueado(profissionalId: string, dataCol: string, slot: string): boolean {
    const inicioSlot = paraUtc(dataCol, slot, fuso);
    const fimSlot = new Date(inicioSlot.getTime() + SLOT_MIN * 60_000);
    const unidadeId = unidadePorProfissional.get(profissionalId);
    return bloqueios.some(
      (b) =>
        b.inicio < fimSlot &&
        b.fim > inicioSlot &&
        (b.profissionalId === profissionalId || (unidadeId !== undefined && b.unidadeId === unidadeId)),
    );
  }

  const qsProf = params.profissionalId ? `&profissionalId=${params.profissionalId}` : "";

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, margin: 0, marginRight: 8 }}>Agenda</h1>
        <a href={`/agenda?visao=${visao}&data=${adicionarDias(data, visao === "dia" ? -1 : -7)}${qsProf}`} style={abaLink}>←</a>
        <strong style={{ fontSize: 15 }}>
          {visao === "dia"
            ? new Date(`${data}T12:00:00Z`).toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                timeZone: "UTC",
              })
            : `Semana de ${inicioDataStr.slice(8)}/${inicioDataStr.slice(5, 7)}`}
        </strong>
        <a href={`/agenda?visao=${visao}&data=${adicionarDias(data, visao === "dia" ? 1 : 7)}${qsProf}`} style={abaLink}>→</a>
        <a href={`/agenda?visao=${visao}`} style={abaLink}>Hoje</a>
        <span style={{ marginLeft: 12 }} />
        <a href={`/agenda?data=${data}`} style={visao === "dia" ? abaAtiva : abaLink}>Dia</a>
        <a href={`/agenda?visao=semana&data=${data}`} style={visao === "semana" ? abaAtiva : abaLink}>Semana</a>
        {visao === "semana" && profissionais.length > 1 && (
          <span style={{ display: "flex", gap: 4, marginLeft: 8, flexWrap: "wrap" }}>
            {profissionais.map((p) => (
              <a
                key={p.id}
                href={`/agenda?visao=semana&data=${data}&profissionalId=${p.id}`}
                style={p.id === profissionalSemana?.id ? abaAtiva : abaLink}
              >
                {p.nome}
              </a>
            ))}
          </span>
        )}
      </div>

      {profissionais.length === 0 ? (
        <p style={{ color: "#666" }}>
          Cadastre um <a href="/agenda/profissionais">profissional</a> e um{" "}
          <a href="/agenda/servicos">serviço</a> para começar a agendar.
        </p>
      ) : (
        <>
          {podeCriar && servicos.length > 0 && (
            <AgendamentoForm
              profissionais={profissionais.map((p) => ({ id: p.id, nome: p.nome }))}
              servicos={servicos.map((s) => ({ id: s.id, nome: `${s.nome} (${s.duracaoMin}min)` }))}
              clientes={clientes.map((c) => ({
                id: c.id,
                nome: c.telefone ? `${c.nome} · ${c.telefone}` : c.nome,
              }))}
              dataInicial={data}
            />
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ ...cab, width: 52 }} />
                  {colunas.map((c) => (
                    <th key={c.chave} style={cab}>{c.titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LINHAS.map((slot) => (
                  <tr key={slot}>
                    <td style={{ ...cel, color: "#888", fontSize: 12, textAlign: "right", paddingRight: 6 }}>
                      {slot}
                    </td>
                    {colunas.map((c) => {
                      const bloqueada = slotBloqueado(c.profissionalId, c.dataCol, slot);
                      const lista = chips.get(`${c.chave}|${slot}`) ?? [];
                      return (
                        <td key={c.chave} style={{ ...cel, background: bloqueada ? "#f3f3f3" : undefined }}>
                          {lista.map((chip) => (
                            <div
                              key={chip.id}
                              style={{
                                background: chip.status === "concluido" ? "#e8f0e8" : "#fff",
                                borderLeft: `3px solid ${chip.cor}`,
                                borderRadius: 4,
                                padding: "2px 6px",
                                marginBottom: 2,
                                boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                                textDecoration: chip.status === "concluido" ? "line-through" : undefined,
                              }}
                            >
                              {chip.rotulo}
                              {podeCancelar && chip.status !== "concluido" && (
                                <span style={{ marginLeft: 6, whiteSpace: "nowrap" }}>
                                  <form action={agendamentoStatusAction} style={{ display: "inline" }}>
                                    <input type="hidden" name="id" value={chip.id} />
                                    <input type="hidden" name="status" value="concluido" />
                                    <button type="submit" title="Concluir" style={mini}>✓</button>
                                  </form>
                                  <form action={agendamentoStatusAction} style={{ display: "inline" }}>
                                    <input type="hidden" name="id" value={chip.id} />
                                    <input type="hidden" name="status" value="cancelado" />
                                    <button type="submit" title="Cancelar" style={mini}>✕</button>
                                  </form>
                                </span>
                              )}
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: "#999", fontSize: 12, margin: 0 }}>
            Células cinza = período bloqueado · ✓ concluir · ✕ cancelar · Fuso: {fuso}
          </p>
        </>
      )}
    </div>
  );
}

const cab: React.CSSProperties = { textAlign: "left", borderBottom: "2px solid #ddd", padding: "0.35rem 0.4rem", color: "#555", fontSize: 13 };
const cel: React.CSSProperties = { borderBottom: "1px solid #eee", borderLeft: "1px solid #f2f2f2", padding: "1px 3px", height: 26, verticalAlign: "top" };
const mini: React.CSSProperties = { background: "none", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", fontSize: 11, padding: "0 4px", marginLeft: 2 };
const abaLink: React.CSSProperties = { color: "#333", textDecoration: "none", padding: "0.3rem 0.6rem", borderRadius: 6, fontSize: 13, background: "#f2f2f2" };
const abaAtiva: React.CSSProperties = { ...abaLink, background: "#111", color: "#fff" };
