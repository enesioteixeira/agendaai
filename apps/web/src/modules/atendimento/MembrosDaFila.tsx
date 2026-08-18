"use client";

import { useActionState } from "react";

import { Botao } from "@atende/ui";

import { ErroDoFormulario } from "@/componentes/Campo";

import { definirMembrosAction, type EstadoDeConfiguracao } from "./configuracao-actions";

export interface UsuarioDaEmpresa {
  readonly usuarioId: string;
  readonly nome: string;
  readonly email: string;
  readonly papel: string;
}

/**
 * Quem atende a fila.
 *
 * LISTA COMPLETA A CADA SALVAMENTO, não marcações incrementais: o `FormData`
 * carrega todos os `usuarioIds` marcados, e `definirMembrosDaFila` desativa quem
 * ficou de fora. É o que faz "tirei fulano da fila" funcionar — com envio
 * incremental, remover exigiria uma segunda ação e a tela teria dois botões para
 * uma decisão só.
 *
 * Desmarcar todo mundo é permitido e o efeito é dito em voz alta abaixo: a fila
 * fica sem quem receba. Não é erro — é como se monta uma fila que ainda vai
 * ganhar equipe —, mas conversa que entra numa fila sem membro ativo espera
 * alguém assumir pela inbox, e quem configurou precisa saber disso agora, não na
 * primeira reclamação de cliente.
 */
export function MembrosDaFila({
  filaId,
  usuarios,
  selecionados,
  distribuicao,
}: {
  readonly filaId: string;
  readonly usuarios: readonly UsuarioDaEmpresa[];
  readonly selecionados: readonly string[];
  readonly distribuicao: string;
}) {
  const [estado, action, enviando] = useActionState<EstadoDeConfiguracao, FormData>(
    definirMembrosAction,
    {},
  );

  const marcados = new Set(selecionados);

  if (usuarios.length === 0) {
    return (
      <p className="text-[12px] text-texto-fraco">
        Nenhum usuário ativo nesta empresa além de você.{" "}
        <a href="/configuracoes" className="text-acento underline">
          Convide o time
        </a>{" "}
        para poder distribuir as conversas.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="filaId" value={filaId} />

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {usuarios.map((u) => (
          <li key={u.usuarioId}>
            <label className="flex cursor-pointer items-start gap-2 rounded-2 px-2 py-1.5 text-[13px] transition-colors hover:bg-superficie-2">
              <input
                type="checkbox"
                name="usuarioIds"
                value={u.usuarioId}
                defaultChecked={marcados.has(u.usuarioId)}
                className="mt-0.5 h-4 w-4 accent-[var(--acento)]"
              />
              <span className="min-w-0">
                <span className="block truncate text-texto">{u.nome}</span>
                <span className="block truncate text-[11px] text-texto-fraco">
                  {u.papel} · {u.email}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {selecionados.length === 0 && distribuicao !== "manual" ? (
        <p className="text-[11px] text-atencao">
          Esta fila distribui automaticamente e está sem ninguém — enquanto ficar assim, a conversa
          entra e fica esperando alguém assumir pela inbox.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar equipe"}
        </Botao>
        {estado.ok ? <span className="text-[12px] text-sucesso">Equipe atualizada.</span> : null}
        <ErroDoFormulario>{estado.erro}</ErroDoFormulario>
      </div>
    </form>
  );
}
