"use client";

import { useActionState } from "react";

import { Botao } from "@atende/ui";

import { Campo, Entrada, ErroDoFormulario } from "@/componentes/Campo";

import { canalCriarAction, type EstadoAtendimento } from "./actions";

export function CanalForm() {
  const [estado, action, pending] = useActionState<EstadoAtendimento, FormData>(
    canalCriarAction,
    {},
  );

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-2 border border-borda bg-superficie p-4 sm:flex-row sm:items-end"
    >
      <Campo
        rotulo="Nome do canal"
        dica="Só para você identificar — o cliente não vê."
        className="flex-1"
      >
        <Entrada name="nome" required placeholder="WhatsApp Recepção" />
      </Campo>

      <div className="flex flex-col gap-1">
        <Botao type="submit" variante="primario" disabled={pending}>
          {pending ? "Criando…" : "Adicionar WhatsApp"}
        </Botao>
      </div>

      <ErroDoFormulario>{estado.erro}</ErroDoFormulario>
    </form>
  );
}
