"use client";

import { useActionState } from "react";
import { recursoSalvarAction, type EstadoAgendaForm } from "./actions";
import type { UnidadeOpcao } from "./ProfissionalForm";
import { lb, ip, bt, erroTxt } from "./estilos";

export interface RecursoEditavel {
  id: string;
  nome: string;
  unidadeId: string;
  tipo: string;
  capacidade: number;
}

export function RecursoForm({
  unidades,
  recurso,
}: {
  unidades: UnidadeOpcao[];
  recurso?: RecursoEditavel;
}) {
  const [estado, action, pending] = useActionState<EstadoAgendaForm, FormData>(
    recursoSalvarAction,
    {},
  );

  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
      {recurso && <input type="hidden" name="id" value={recurso.id} />}
      <label style={lb}>
        Nome
        <input name="nome" required defaultValue={recurso?.nome} style={{ ...ip, minWidth: 160 }} placeholder="Sala 1" />
      </label>
      <label style={lb}>
        Unidade
        <select name="unidadeId" required defaultValue={recurso?.unidadeId} style={ip}>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      </label>
      <label style={lb}>
        Tipo
        <select name="tipo" required defaultValue={recurso?.tipo ?? "sala"} style={ip}>
          <option value="sala">Sala</option>
          <option value="cadeira">Cadeira</option>
          <option value="equipamento">Equipamento</option>
        </select>
      </label>
      <button type="submit" disabled={pending} style={bt}>
        {pending ? "Salvando..." : recurso ? "Salvar" : "Adicionar"}
      </button>
      {estado.erro && <p style={erroTxt}>{estado.erro}</p>}
    </form>
  );
}
