"use client";

import { useActionState } from "react";
import { clienteCriarAction, type EstadoAgendaForm } from "./actions";
import { lb, ip, bt, erroTxt } from "./estilos";

export function ClienteForm() {
  const [estado, action, pending] = useActionState<EstadoAgendaForm, FormData>(
    clienteCriarAction,
    {},
  );

  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
      <label style={lb}>
        Nome
        <input name="nome" required style={{ ...ip, minWidth: 200 }} placeholder="Ana Souza" />
      </label>
      <label style={lb}>
        WhatsApp/telefone
        <input name="telefone" style={{ ...ip, width: 150 }} placeholder="11999998888" />
      </label>
      <label style={lb}>
        E-mail (opcional)
        <input name="email" type="email" style={{ ...ip, minWidth: 180 }} />
      </label>
      <button type="submit" disabled={pending} style={bt}>
        {pending ? "Salvando..." : "Adicionar cliente"}
      </button>
      {estado.erro && <p style={erroTxt}>{estado.erro}</p>}
    </form>
  );
}
