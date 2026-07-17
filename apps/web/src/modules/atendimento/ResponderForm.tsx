"use client";

import { useActionState, useRef, useEffect } from "react";
import { responderConversaAction, type EstadoAtendimento } from "./actions";

export function ResponderForm({ conversaId }: { conversaId: string }) {
  const [estado, action, pending] = useActionState<EstadoAtendimento, FormData>(
    responderConversaAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  // limpa o campo após envio bem-sucedido
  useEffect(() => {
    if (estado.ok) formRef.current?.reset();
  }, [estado]);

  return (
    <form ref={formRef} action={action} style={{ display: "flex", gap: 8, alignItems: "start" }}>
      <input type="hidden" name="conversaId" value={conversaId} />
      <textarea
        name="texto"
        required
        rows={2}
        placeholder="Escreva sua resposta..."
        style={{ flex: 1, padding: "0.6rem 0.7rem", border: "1px solid #ccc", borderRadius: 8, fontSize: 15, fontFamily: "inherit", resize: "vertical" }}
      />
      <button
        type="submit"
        disabled={pending}
        style={{ padding: "0.6rem 1rem", background: "#111", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" }}
      >
        {pending ? "Enviando..." : "Enviar"}
      </button>
      {estado.erro && <p style={{ color: "#c0362c", margin: 0, fontSize: 13 }}>{estado.erro}</p>}
    </form>
  );
}
