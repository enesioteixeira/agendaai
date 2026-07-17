"use client";

import { useActionState } from "react";
import { canalCriarAction, type EstadoAtendimento } from "./actions";

export function CanalForm() {
  const [estado, action, pending] = useActionState<EstadoAtendimento, FormData>(
    canalCriarAction,
    {},
  );
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
      <label style={{ display: "grid", gap: 4, fontSize: 14, color: "#333" }}>
        Nome do canal
        <input
          name="nome"
          required
          placeholder="WhatsApp Recepção"
          style={{ padding: "0.5rem 0.6rem", border: "1px solid #ccc", borderRadius: 6, fontSize: 15, minWidth: 220 }}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        style={{ padding: "0.55rem 0.9rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, cursor: "pointer" }}
      >
        {pending ? "Criando..." : "Adicionar WhatsApp"}
      </button>
      {estado.erro && <p style={{ color: "#c0362c", margin: 0, fontSize: 14 }}>{estado.erro}</p>}
    </form>
  );
}
