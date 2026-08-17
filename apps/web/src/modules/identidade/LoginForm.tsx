"use client";

import { useActionState } from "react";
import { loginAction, type EstadoForm } from "./actions";

export function LoginForm() {
  const [estado, action, pending] = useActionState<EstadoForm, FormData>(loginAction, {});

  return (
    <form action={action} style={{ display: "grid", gap: "0.85rem" }}>
      <label style={lb}>
        E-mail
        <input name="email" type="email" required style={ip} autoComplete="email" defaultValue={estado.valores?.email} />
      </label>
      <label style={lb}>
        Senha
        <input name="senha" type="password" required style={ip} autoComplete="current-password" />
      </label>

      {estado.erro && <p style={{ color: "var(--perigo)", margin: 0, fontSize: 14 }}>{estado.erro}</p>}

      <button type="submit" disabled={pending} style={bt}>
        {pending ? "Entrando..." : "Entrar"}
      </button>
      <p style={{ fontSize: 14, color: "var(--texto-suave)", margin: 0 }}>
        Não tem conta? <a href="/cadastro">Criar empresa</a>
      </p>
    </form>
  );
}

const lb: React.CSSProperties = { display: "grid", gap: 4, fontSize: 14, color: "var(--texto)" };
const ip: React.CSSProperties = { padding: "0.5rem 0.6rem", border: "1px solid var(--borda)", borderRadius: 6, fontSize: 15 };
const bt: React.CSSProperties = { padding: "0.65rem", background: "var(--acento)", color: "var(--acento-texto)", border: "none", borderRadius: 6, fontSize: 15, cursor: "pointer" };
