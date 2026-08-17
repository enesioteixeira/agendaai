"use client";

import { useActionState } from "react";

import { Campo, Entrada, ErroDoFormulario } from "@/componentes/Campo";

import { loginAction, type EstadoForm } from "./actions";

export function LoginForm() {
  const [estado, action, pending] = useActionState<EstadoForm, FormData>(loginAction, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <Campo rotulo="E-mail">
        <Entrada
          name="email"
          type="email"
          required
          autoComplete="email"
          // Preservar o e-mail no erro evita redigitar depois de errar a senha —
          // e é o único campo que dá para preservar sem guardar credencial.
          defaultValue={estado.valores?.email}
        />
      </Campo>

      <Campo rotulo="Senha">
        <Entrada name="senha" type="password" required autoComplete="current-password" />
      </Campo>

      <ErroDoFormulario>{estado.erro}</ErroDoFormulario>

      {/* `w-full` porque este é o botão de ação única da tela: no celular ele
          deve ocupar a largura toda, e não ficar um retângulo pequeno à esquerda. */}
      <button
        type="submit"
        disabled={pending}
        className="ie-botao ie-botao--primario w-full justify-center"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
