"use client";

import { useActionState } from "react";
import { profissionalSalvarAction, type EstadoAgendaForm } from "./actions";
import { lb, ip, bt, erroTxt } from "./estilos";

export interface UnidadeOpcao {
  id: string;
  nome: string;
}

export interface ProfissionalEditavel {
  id: string;
  nome: string;
  unidadeId: string;
  cor: string | null;
}

export function ProfissionalForm({
  unidades,
  profissional,
}: {
  unidades: UnidadeOpcao[];
  profissional?: ProfissionalEditavel;
}) {
  const [estado, action, pending] = useActionState<EstadoAgendaForm, FormData>(
    profissionalSalvarAction,
    {},
  );

  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
      {profissional && <input type="hidden" name="id" value={profissional.id} />}
      <label style={lb}>
        Nome
        <input name="nome" required defaultValue={profissional?.nome} style={{ ...ip, minWidth: 200 }} placeholder="Maria Silva" />
      </label>
      <label style={lb}>
        Unidade
        <select name="unidadeId" required defaultValue={profissional?.unidadeId} style={ip}>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      </label>
      <label style={lb}>
        Cor na agenda
        <input name="cor" type="color" defaultValue={profissional?.cor ?? "#4f7cff"} style={{ ...ip, padding: 2, width: 52, height: 38 }} />
      </label>
      <button type="submit" disabled={pending} style={bt}>
        {pending ? "Salvando..." : profissional ? "Salvar" : "Adicionar profissional"}
      </button>
      {estado.erro && <p style={erroTxt}>{estado.erro}</p>}
    </form>
  );
}
