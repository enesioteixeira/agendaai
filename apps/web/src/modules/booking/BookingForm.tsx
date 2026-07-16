"use client";

import { useActionState } from "react";
import { agendarBookingAction, type EstadoBooking } from "./actions";

// Passo final da booking: nome + WhatsApp e confirmar. Os passos anteriores
// (serviço/profissional/data/hora) viajam como hidden — escolhidos por links
// server-rendered na página.
export function BookingForm({
  slug,
  servicoId,
  profissionalId,
  data,
  hora,
}: {
  slug: string;
  servicoId: string;
  profissionalId: string;
  data: string;
  hora: string;
}) {
  const [estado, action, pending] = useActionState<EstadoBooking, FormData>(
    agendarBookingAction,
    {},
  );

  return (
    <form action={action} style={{ display: "grid", gap: 10, maxWidth: 380 }}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="servicoId" value={servicoId} />
      <input type="hidden" name="profissionalId" value={profissionalId} />
      <input type="hidden" name="data" value={data} />
      <input type="hidden" name="hora" value={hora} />
      <label style={lb}>
        Seu nome
        <input name="clienteNome" required minLength={2} style={ip} placeholder="Ana Souza" />
      </label>
      <label style={lb}>
        WhatsApp (com DDD)
        <input name="clienteTelefone" required style={ip} placeholder="11999998888" inputMode="tel" />
      </label>
      <button type="submit" disabled={pending} style={bt}>
        {pending ? "Confirmando..." : `Confirmar ${hora}`}
      </button>
      {estado.erro && <p style={{ color: "#c0362c", margin: 0, fontSize: 14 }}>{estado.erro}</p>}
    </form>
  );
}

const lb: React.CSSProperties = { display: "grid", gap: 4, fontSize: 14, color: "#333" };
const ip: React.CSSProperties = { padding: "0.6rem 0.7rem", border: "1px solid #ccc", borderRadius: 8, fontSize: 16 };
const bt: React.CSSProperties = { padding: "0.7rem 1rem", background: "#111", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, cursor: "pointer" };
