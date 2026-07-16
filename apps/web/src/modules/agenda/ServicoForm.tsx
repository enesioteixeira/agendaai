"use client";

import { useActionState } from "react";
import { servicoSalvarAction, type EstadoAgendaForm } from "./actions";
import { lb, ip, bt, erroTxt } from "./estilos";

export interface ServicoEditavel {
  id: string;
  nome: string;
  duracaoMin: number;
  precoCentavos: number;
  exigeSinal: boolean;
  percentualSinalBp: number | null;
  visivelNaBooking: boolean;
}

// Um form, dois usos: sem `servico` cria; com `servico` edita (id no hidden).
export function ServicoForm({ servico }: { servico?: ServicoEditavel }) {
  const [estado, action, pending] = useActionState<EstadoAgendaForm, FormData>(
    servicoSalvarAction,
    {},
  );

  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
      {servico && <input type="hidden" name="id" value={servico.id} />}
      <label style={lb}>
        Nome
        <input name="nome" required defaultValue={servico?.nome} style={{ ...ip, minWidth: 180 }} placeholder="Corte feminino" />
      </label>
      <label style={lb}>
        Duração (min)
        <input name="duracaoMin" type="number" min={5} step={5} required defaultValue={servico?.duracaoMin ?? 60} style={{ ...ip, width: 90 }} />
      </label>
      <label style={lb}>
        Preço (R$)
        <input name="precoReais" type="number" min={0} step="0.01" required defaultValue={servico ? (servico.precoCentavos / 100).toFixed(2) : undefined} style={{ ...ip, width: 110 }} placeholder="80,00" />
      </label>
      <label style={{ ...lb, flexDirection: "row", alignItems: "center", display: "flex", gap: 6 }}>
        <input type="checkbox" name="visivelNaBooking" defaultChecked={servico?.visivelNaBooking ?? true} />
        Visível na booking
      </label>
      <button type="submit" disabled={pending} style={bt}>
        {pending ? "Salvando..." : servico ? "Salvar" : "Adicionar serviço"}
      </button>
      {estado.erro && <p style={erroTxt}>{estado.erro}</p>}
    </form>
  );
}
