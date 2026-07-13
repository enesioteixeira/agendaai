"use client";

import { useActionState } from "react";
import { convidarAction, type EstadoConvite } from "./convites-actions";

export function ConvidarForm({ papeis }: { papeis: { id: string; nome: string }[] }) {
  const [estado, action, pending] = useActionState<EstadoConvite, FormData>(convidarAction, {});

  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <form action={action} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
        <label style={lb}>
          E-mail do convidado
          <input name="email" type="email" required style={ip} placeholder="pessoa@exemplo.com" />
        </label>
        <label style={lb}>
          Papel
          <select name="papelId" required style={ip}>
            {papeis.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} style={bt}>
          {pending ? "Gerando..." : "Gerar convite"}
        </button>
      </form>

      {estado.erro && <p style={{ color: "#c0362c", margin: 0, fontSize: 14 }}>{estado.erro}</p>}

      {estado.linkConvite && (
        <div style={{ background: "#f0f7f0", border: "1px solid #bfd8bf", borderRadius: 8, padding: "0.75rem 1rem", fontSize: 14 }}>
          <strong>Convite criado para {estado.emailConvidado}</strong> (válido por 7 dias).
          <br />
          Envie este link para a pessoa:
          <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{ background: "#fff", padding: "0.35rem 0.5rem", borderRadius: 6, border: "1px solid #ddd", wordBreak: "break-all", flex: 1 }}>
              {estado.linkConvite}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(estado.linkConvite ?? "")}
              style={{ ...bt, padding: "0.35rem 0.7rem" }}
            >
              Copiar
            </button>
          </div>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            O envio automático por e-mail entra quando o módulo de e-mail for ativado.
          </p>
        </div>
      )}
    </div>
  );
}

const lb: React.CSSProperties = { display: "grid", gap: 4, fontSize: 14, color: "#333" };
const ip: React.CSSProperties = { padding: "0.5rem 0.6rem", border: "1px solid #ccc", borderRadius: 6, fontSize: 15, minWidth: 220 };
const bt: React.CSSProperties = { padding: "0.55rem 0.9rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, cursor: "pointer" };
