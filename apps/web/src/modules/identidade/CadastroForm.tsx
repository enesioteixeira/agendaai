"use client";

import { useActionState } from "react";

import { Campo, Entrada, ErroDoFormulario, Selecao } from "@/componentes/Campo";

// Subcaminho, e NÃO o barril do core: `@atende/core` reexporta o módulo de
// cripto, que abre com `import crypto from "node:crypto"`, e este arquivo é
// `"use client"` — importar do barril arrasta node:crypto para o bundle do
// navegador e o build morre com UnhandledSchemeError. O package expõe
// `"./*"`, então o subcaminho traz só o schema, que depende apenas de Zod.
import { ROTULO_VERTICAL, verticalEmpresaSchema } from "@atende/core/identidade/schemas";

import { cadastrarAction, type EstadoForm } from "./actions";

// A lista vem do contrato, e não de uma cópia local: a vertical vai para o
// banco como enum e para os nomes de papel, então uma opção que só exista aqui
// vira erro de escrita no cadastro.
const VERTICAIS = verticalEmpresaSchema.options.map((valor) => ({
  valor,
  rotulo: ROTULO_VERTICAL[valor],
}));

export function CadastroForm() {
  const [estado, action, pending] = useActionState<EstadoForm, FormData>(cadastrarAction, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3 rounded-2 border border-borda p-4">
        <legend className="px-1.5 text-[12px] font-semibold text-texto">Seus dados</legend>

        <Campo rotulo="Nome">
          <Entrada name="nome" required autoComplete="name" defaultValue={estado.valores?.nome} />
        </Campo>
        <Campo rotulo="E-mail">
          <Entrada
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={estado.valores?.email}
          />
        </Campo>
        <Campo rotulo="Senha" dica="Mínimo de 8 caracteres.">
          <Entrada name="senha" type="password" required minLength={8} autoComplete="new-password" />
        </Campo>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-2 border border-borda p-4">
        <legend className="px-1.5 text-[12px] font-semibold text-texto">Sua empresa</legend>

        <Campo rotulo="Nome da empresa">
          <Entrada name="empresaNome" required defaultValue={estado.valores?.empresaNome} />
        </Campo>

        <Campo
          rotulo="Endereço da página de agendamento"
          dica="Só letras minúsculas, números e hífen."
        >
          <span className="flex items-center gap-1.5">
            <Entrada
              name="empresaSlug"
              required
              pattern="[a-z0-9\-]+"
              placeholder="minha-empresa"
              defaultValue={estado.valores?.empresaSlug}
            />
            <span className="shrink-0 text-[12px] text-texto-fraco">.atende-ai.com.br</span>
          </span>
        </Campo>

        <Campo rotulo="Ramo">
          <Selecao name="vertical" required defaultValue={estado.valores?.vertical || "distribuidor_alimentos"}>
            {VERTICAIS.map((v) => (
              <option key={v.valor} value={v.valor}>
                {v.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
      </fieldset>

      <ErroDoFormulario>{estado.erro}</ErroDoFormulario>

      <button
        type="submit"
        disabled={pending}
        className="ie-botao ie-botao--primario w-full justify-center"
      >
        {pending ? "Criando…" : "Criar conta e empresa"}
      </button>
    </form>
  );
}
