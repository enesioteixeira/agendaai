"use client";

import { useActionState } from "react";

import { Badge, Botao } from "@atende/ui";

import { Campo, Entrada, ErroDoFormulario, Selecao } from "@/componentes/Campo";

import { salvarChaveIaAction, type EstadoAgente } from "./actions";

const PROVEDORES = [
  { valor: "anthropic", rotulo: "Anthropic (Claude)" },
  { valor: "gemini", rotulo: "Google Gemini" },
  { valor: "openai", rotulo: "OpenAI" },
  { valor: "grok", rotulo: "xAI (Grok)" },
] as const;

/**
 * A chave do provedor de modelo.
 *
 * O campo nasce vazio mesmo quando já existe uma chave: ela é cifrada e **nunca
 * volta para a tela**. O que a interface informa é se existe, não qual é —
 * trocar significa enviar outra.
 */
export function FormChaveIa({
  configurados,
  erros,
}: {
  readonly configurados: readonly string[];
  readonly erros: Readonly<Record<string, string | null>>;
}) {
  const [estado, action, enviando] = useActionState<EstadoAgente, FormData>(
    salvarChaveIaAction,
    {},
  );

  return (
    <div className="flex flex-col gap-3 rounded-2 border border-borda bg-superficie p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-[14px] font-semibold">Chave do provedor</h2>
        {configurados.length === 0 ? (
          <Badge tom="atencao">nenhuma configurada</Badge>
        ) : (
          configurados.map((p) => (
            <Badge key={p} tom={erros[p] ? "perigo" : "sucesso"}>
              {p}
            </Badge>
          ))
        )}
      </div>

      {configurados.map((p) =>
        erros[p] ? (
          <p key={p} className="text-[12px] text-perigo">
            {p}: {erros[p]}
          </p>
        ) : null,
      )}

      <p className="text-[12px] leading-relaxed text-texto-suave">
        A chave é sua e fica cifrada. Sem ela o agente não responde — a conversa vai para a
        fila e um humano atende.
      </p>

      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Campo rotulo="Provedor" className="sm:w-56">
          <Selecao name="provedor" defaultValue="anthropic">
            {PROVEDORES.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>

        <Campo rotulo="Chave de API" className="flex-1">
          <Entrada
            name="apiKey"
            type="password"
            required
            minLength={20}
            autoComplete="off"
            placeholder="sk-ant-…"
            className="font-mono"
          />
        </Campo>

        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar chave"}
        </Botao>
      </form>

      {estado.ok ? <p className="text-[12px] text-sucesso">Chave salva.</p> : null}
      <ErroDoFormulario>{estado.erro}</ErroDoFormulario>
    </div>
  );
}
