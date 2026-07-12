"use client";

import { useActionState } from "react";
import { cadastrarAction, type EstadoForm } from "./actions";

const VERTICAIS = [
  { valor: "salao", rotulo: "Salão de beleza" },
  { valor: "barbearia", rotulo: "Barbearia" },
  { valor: "clinica_estetica", rotulo: "Clínica de estética" },
  { valor: "clinica_medica", rotulo: "Clínica médica" },
  { valor: "advocacia", rotulo: "Escritório de advocacia" },
  { valor: "outro", rotulo: "Outro" },
];

export function CadastroForm() {
  const [estado, action, pending] = useActionState<EstadoForm, FormData>(cadastrarAction, {});

  return (
    <form action={action} style={{ display: "grid", gap: "0.85rem" }}>
      <fieldset style={fs}>
        <legend style={lg}>Seus dados</legend>
        <label style={lb}>
          Nome
          <input name="nome" required style={ip} autoComplete="name" />
        </label>
        <label style={lb}>
          E-mail
          <input name="email" type="email" required style={ip} autoComplete="email" />
        </label>
        <label style={lb}>
          Senha (mín. 8 caracteres)
          <input name="senha" type="password" required minLength={8} style={ip} autoComplete="new-password" />
        </label>
      </fieldset>

      <fieldset style={fs}>
        <legend style={lg}>Sua empresa</legend>
        <label style={lb}>
          Nome da empresa
          <input name="empresaNome" required style={ip} />
        </label>
        <label style={lb}>
          Endereço da página de agendamento
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              name="empresaSlug"
              required
              pattern="[a-z0-9\-]+"
              placeholder="minha-empresa"
              style={{ ...ip, flex: 1 }}
            />
            <span style={{ color: "#888", fontSize: 13 }}>.atende-ai.com.br</span>
          </span>
        </label>
        <label style={lb}>
          Ramo
          <select name="vertical" required style={ip} defaultValue="salao">
            {VERTICAIS.map((v) => (
              <option key={v.valor} value={v.valor}>{v.rotulo}</option>
            ))}
          </select>
        </label>
      </fieldset>

      {estado.erro && <p style={{ color: "#c0362c", margin: 0, fontSize: 14 }}>{estado.erro}</p>}

      <button type="submit" disabled={pending} style={bt}>
        {pending ? "Criando..." : "Criar conta e empresa"}
      </button>
      <p style={{ fontSize: 14, color: "#666", margin: 0 }}>
        Já tem conta? <a href="/login">Entrar</a>
      </p>
    </form>
  );
}

const fs: React.CSSProperties = { border: "1px solid #e2e2e2", borderRadius: 8, padding: "0.75rem 1rem", display: "grid", gap: "0.75rem" };
const lg: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#444", padding: "0 6px" };
const lb: React.CSSProperties = { display: "grid", gap: 4, fontSize: 14, color: "#333" };
const ip: React.CSSProperties = { padding: "0.5rem 0.6rem", border: "1px solid #ccc", borderRadius: 6, fontSize: 15 };
const bt: React.CSSProperties = { padding: "0.65rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: 15, cursor: "pointer" };
