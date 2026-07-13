"use client";

import { useActionState } from "react";
import { aceitarConviteAction, type EstadoAceite } from "./convites-actions";

export function AceitarConviteForm({
  token,
  emailJaCadastrado,
}: {
  token: string;
  emailJaCadastrado: boolean;
}) {
  const [estado, action, pending] = useActionState<EstadoAceite, FormData>(aceitarConviteAction, {});

  return (
    <form action={action} style={{ display: "grid", gap: "0.85rem" }}>
      <input type="hidden" name="token" value={token} />

      {!emailJaCadastrado && (
        <>
          <label style={lb}>
            Seu nome
            <input name="nome" required style={ip} autoComplete="name" />
          </label>
          <label style={lb}>
            Crie uma senha (mín. 8 caracteres)
            <input name="senha" type="password" required minLength={8} style={ip} autoComplete="new-password" />
          </label>
        </>
      )}

      {estado.erro && <p style={{ color: "#c0362c", margin: 0, fontSize: 14 }}>{estado.erro}</p>}

      <button type="submit" disabled={pending} style={bt}>
        {pending ? "Entrando..." : emailJaCadastrado ? "Aceitar convite e entrar" : "Criar conta e entrar"}
      </button>
    </form>
  );
}

const lb: React.CSSProperties = { display: "grid", gap: 4, fontSize: 14, color: "#333" };
const ip: React.CSSProperties = { padding: "0.5rem 0.6rem", border: "1px solid #ccc", borderRadius: 6, fontSize: 15 };
const bt: React.CSSProperties = { padding: "0.65rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: 15, cursor: "pointer" };
