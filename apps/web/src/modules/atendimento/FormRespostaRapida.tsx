"use client";

import { useActionState } from "react";

import { Botao } from "@atende/ui";

import {
  AreaDeTexto,
  Campo,
  Entrada,
  ErroDoFormulario,
  LinhaDeCampos,
  Selecao,
} from "@/componentes/Campo";

import {
  atualizarRespostaRapidaAction,
  criarRespostaRapidaAction,
  type EstadoDeConfiguracao,
} from "./configuracao-actions";

export interface RespostaEditavel {
  readonly id: string;
  readonly atalho: string;
  readonly titulo: string;
  readonly texto: string;
  readonly filaId: string | null;
}

export interface OpcaoDeFila {
  readonly id: string;
  readonly nome: string;
}

/**
 * Cadastro e edição de resposta rápida.
 *
 * O ATALHO É MOSTRADO COM A BARRA e gravado sem ela. A barra é o gatilho do
 * composer, não parte do nome: guardá-la faria "prazo" e "/prazo" serem dois
 * atalhos distintos para o `@@unique([empresaId, atalho])`, e o composer
 * escolheria um deles por acaso. Quem digita a barra aqui não erra — a
 * normalização de `@atende/db` a remove — e por isso o prefixo aparece colado ao
 * campo, para explicar como se usa sem transformar isso em regra de digitação.
 *
 * "Fila" restringe a resposta a uma fila; vazio vale para a empresa toda. É o
 * mesmo campo que DESFAZ a restrição, e por isso o formulário sempre manda o
 * valor: sem isso, "tirar da fila Financeiro" não teria como ser dito.
 */
export function FormRespostaRapida({
  resposta,
  filas,
}: {
  readonly resposta?: RespostaEditavel;
  readonly filas: readonly OpcaoDeFila[];
}) {
  const editando = resposta !== undefined;
  const [estado, action, enviando] = useActionState<EstadoDeConfiguracao, FormData>(
    editando ? atualizarRespostaRapidaAction : criarRespostaRapidaAction,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      {editando ? <input type="hidden" name="id" value={resposta.id} /> : null}

      <LinhaDeCampos>
        <Campo rotulo="Atalho" dica="Digitado no atendimento como /atalho.">
          <div className="flex items-center gap-1">
            <span aria-hidden className="text-[14px] text-texto-fraco">
              /
            </span>
            <Entrada
              name="atalho"
              required
              maxLength={32}
              defaultValue={resposta?.atalho ?? ""}
              placeholder="prazo-entrega"
            />
          </div>
        </Campo>

        <Campo rotulo="Título" dica="Como a resposta aparece na lista do atendente.">
          <Entrada
            name="titulo"
            required
            minLength={2}
            maxLength={80}
            defaultValue={resposta?.titulo ?? ""}
            placeholder="Prazo de entrega padrão"
          />
        </Campo>
      </LinhaDeCampos>

      <Campo rotulo="Texto enviado">
        <AreaDeTexto
          name="texto"
          required
          rows={4}
          maxLength={4000}
          defaultValue={resposta?.texto ?? ""}
          placeholder="Nosso prazo de entrega para a sua região é de 2 a 3 dias úteis após a confirmação do pedido."
        />
      </Campo>

      <Campo
        rotulo="Restringir a uma fila"
        dica="Em branco, a resposta fica disponível em todas as filas."
        className="max-w-sm"
      >
        <Selecao name="filaId" defaultValue={resposta?.filaId ?? ""}>
          <option value="">Todas as filas</option>
          {filas.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </Selecao>
      </Campo>

      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Salvando…" : editando ? "Salvar alterações" : "Criar resposta"}
        </Botao>
        {estado.ok ? <span className="text-[12px] text-sucesso">Salvo.</span> : null}
        <ErroDoFormulario>{estado.erro}</ErroDoFormulario>
      </div>
    </form>
  );
}
