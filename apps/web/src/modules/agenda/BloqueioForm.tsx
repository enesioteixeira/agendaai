"use client";

import { useActionState } from "react";
import { bloqueioCriarAction, type EstadoAgendaForm } from "./actions";
import { lb, ip, bt, erroTxt } from "./estilos";

export interface AlvoBloqueio {
  valor: string; // "profissional:<id>" | "recurso:<id>" | "unidade:<id>"
  rotulo: string;
}

export function BloqueioForm({ alvos }: { alvos: AlvoBloqueio[] }) {
  const [estado, action, pending] = useActionState<EstadoAgendaForm, FormData>(
    bloqueioCriarAction,
    {},
  );

  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
      <label style={lb}>
        Alvo
        <select name="alvo" required style={{ ...ip, minWidth: 200 }}>
          {alvos.map((a) => (
            <option key={a.valor} value={a.valor}>{a.rotulo}</option>
          ))}
        </select>
      </label>
      <label style={lb}>
        Tipo
        <select name="tipo" required style={ip}>
          <option value="ferias">Férias / folga</option>
          <option value="almoco">Almoço</option>
          <option value="manutencao">Manutenção</option>
          <option value="outro">Outro</option>
        </select>
      </label>
      <label style={lb}>
        Início
        <input name="inicio" type="datetime-local" required style={ip} />
      </label>
      <label style={lb}>
        Fim
        <input name="fim" type="datetime-local" required style={ip} />
      </label>
      <label style={lb}>
        Motivo (opcional)
        <input name="motivo" style={{ ...ip, minWidth: 160 }} placeholder="ex.: viagem" />
      </label>
      <button type="submit" disabled={pending} style={bt}>
        {pending ? "Criando..." : "Bloquear"}
      </button>
      {estado.erro && <p style={erroTxt}>{estado.erro}</p>}
    </form>
  );
}
