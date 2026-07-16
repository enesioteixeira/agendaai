"use client";

// Editor de grade semanal (intervalos dia/início/fim) — usado tanto para a
// grade de trabalho do profissional quanto para o horário de funcionamento da
// unidade. Serializa cada intervalo como "dia|HH:mm|HH:mm" no campo repetido
// `intervalo` (replace-all na action).

import { useActionState, useState } from "react";
import type { EstadoAgendaForm } from "./actions";
import { ip, bt, btSec, erroTxt, DIAS_SEMANA } from "./estilos";

export interface Intervalo {
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
}

export function GradeHorariosForm({
  action,
  camposOcultos,
  intervalosIniciais,
  rotuloSalvar = "Salvar grade",
}: {
  action: (prev: EstadoAgendaForm, formData: FormData) => Promise<EstadoAgendaForm>;
  camposOcultos: Record<string, string>;
  intervalosIniciais: Intervalo[];
  rotuloSalvar?: string;
}) {
  const [estado, formAction, pending] = useActionState<EstadoAgendaForm, FormData>(action, {});
  const [intervalos, setIntervalos] = useState<Intervalo[]>(intervalosIniciais);
  const [novo, setNovo] = useState<Intervalo>({ diaSemana: 1, horaInicio: "09:00", horaFim: "18:00" });

  return (
    <form action={formAction} style={{ display: "grid", gap: 8, fontSize: 14 }}>
      {Object.entries(camposOcultos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      {intervalos.map((i, idx) => (
        <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="hidden" name="intervalo" value={`${i.diaSemana}|${i.horaInicio}|${i.horaFim}`} />
          <span style={{ width: 40, fontWeight: 600 }}>{DIAS_SEMANA[i.diaSemana]}</span>
          <span>{i.horaInicio} – {i.horaFim}</span>
          <button
            type="button"
            onClick={() => setIntervalos(intervalos.filter((_, j) => j !== idx))}
            style={{ ...btSec, padding: "0.2rem 0.5rem", fontSize: 13 }}
          >
            Remover
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={novo.diaSemana}
          onChange={(e) => setNovo({ ...novo, diaSemana: Number(e.target.value) })}
          style={ip}
        >
          {DIAS_SEMANA.map((d, idx) => (
            <option key={idx} value={idx}>{d}</option>
          ))}
        </select>
        <input type="time" value={novo.horaInicio} onChange={(e) => setNovo({ ...novo, horaInicio: e.target.value })} style={ip} />
        <span>até</span>
        <input type="time" value={novo.horaFim} onChange={(e) => setNovo({ ...novo, horaFim: e.target.value })} style={ip} />
        <button
          type="button"
          onClick={() => setIntervalos([...intervalos, novo])}
          style={btSec}
        >
          + Intervalo
        </button>
        <button type="submit" disabled={pending} style={bt}>
          {pending ? "Salvando..." : rotuloSalvar}
        </button>
      </div>

      {estado.erro && <p style={erroTxt}>{estado.erro}</p>}
      {estado.ok && <p style={{ color: "#2c7a2c", margin: 0, fontSize: 14 }}>Grade salva.</p>}
    </form>
  );
}
