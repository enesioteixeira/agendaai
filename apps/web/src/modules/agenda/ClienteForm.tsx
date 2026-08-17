"use client";

import { useActionState } from "react";

import { Botao } from "@atende/ui";

import {
  Campo,
  Entrada,
  ErroDoFormulario,
  LinhaDeCampos,
} from "@/componentes/Campo";

import { clienteCriarAction, type EstadoAgendaForm } from "./actions";

export function ClienteForm() {
  const [estado, action, pending] = useActionState<EstadoAgendaForm, FormData>(
    clienteCriarAction,
    {},
  );

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-2 border border-borda bg-superficie p-4"
    >
      <LinhaDeCampos>
        <Campo rotulo="Nome">
          <Entrada name="nome" required placeholder="Ana Souza" />
        </Campo>
        <Campo rotulo="WhatsApp / telefone">
          <Entrada name="telefone" inputMode="tel" placeholder="11999998888" />
        </Campo>
      </LinhaDeCampos>

      <Campo rotulo="E-mail" dica="Opcional.">
        <Entrada name="email" type="email" autoComplete="off" />
      </Campo>

      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" variante="primario" disabled={pending}>
          {pending ? "Salvando…" : "Adicionar contato"}
        </Botao>
        <ErroDoFormulario>{estado.erro}</ErroDoFormulario>
      </div>
    </form>
  );
}
