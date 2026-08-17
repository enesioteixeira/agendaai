"use client";

import { useActionState } from "react";

import { Botao } from "@atende/ui";

import { criarAgenteAction, salvarRascunhoAction, type EstadoAgente } from "./actions";

const PROVEDORES = [
  { valor: "anthropic", rotulo: "Anthropic (Claude)" },
  { valor: "gemini", rotulo: "Google Gemini" },
  { valor: "openai", rotulo: "OpenAI" },
  { valor: "grok", rotulo: "xAI (Grok)" },
] as const;

const EXEMPLO_PERSONA =
  "Você é a Ana, atendente da Barbearia Central. Fale de forma simples e direta, " +
  "sem formalidade excessiva. Responda dúvidas sobre serviços e preços, e quando o " +
  "cliente quiser fechar, monte o pedido e peça confirmação antes de gerar a cobrança.";

export function FormNovoAgente() {
  const [estado, action, enviando] = useActionState<EstadoAgente, FormData>(criarAgenteAction, {});

  return (
    <form action={action} className="flex flex-col gap-3 rounded-2 border border-borda bg-superficie p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="nome" className="text-[12px] font-semibold text-texto-suave">
          Nome do agente
        </label>
        <input
          id="nome"
          name="nome"
          required
          minLength={2}
          maxLength={60}
          placeholder="Ex.: Atendente da loja"
          className="rounded-2 border border-borda bg-superficie-2 px-3 py-2 text-[13px] outline-none focus:border-acento"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="persona" className="text-[12px] font-semibold text-texto-suave">
          Persona — quem ele é e como fala
        </label>
        <textarea
          id="persona"
          name="persona"
          required
          minLength={20}
          maxLength={8000}
          rows={6}
          placeholder={EXEMPLO_PERSONA}
          className="resize-y rounded-2 border border-borda bg-superficie-2 px-3 py-2 text-[13px] leading-snug outline-none placeholder:text-texto-fraco focus:border-acento"
        />
        <p className="text-[11px] text-texto-fraco">
          Escreva como se explicasse o trabalho a uma pessoa nova. O agente nasce em rascunho —
          nada vai ao ar até você publicar.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Criando…" : "Criar agente"}
        </Botao>
        {estado.erro ? (
          <p role="alert" className="text-[12px] text-perigo">
            {estado.erro}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function FormEditarVersao({
  versaoId,
  persona,
  provedor,
  publicada,
}: {
  readonly versaoId: string;
  readonly persona: string;
  readonly provedor: string;
  readonly publicada: boolean;
}) {
  const [estado, action, enviando] = useActionState<EstadoAgente, FormData>(
    salvarRascunhoAction,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="versaoId" value={versaoId} />

      <textarea
        name="persona"
        defaultValue={persona}
        required
        minLength={20}
        maxLength={8000}
        rows={8}
        // Versão publicada é imutável: é ela que as conversas em andamento estão
        // usando, e deixar editar daria a impressão de que a mudança vale para
        // quem já está falando com o agente.
        readOnly={publicada}
        className="resize-y rounded-2 border border-borda bg-superficie-2 px-3 py-2 text-[13px] leading-snug outline-none focus:border-acento read-only:opacity-70"
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[12px] text-texto-suave">
          Provedor
          <select
            name="provedor"
            defaultValue={provedor}
            disabled={publicada}
            className="rounded-2 border border-borda bg-superficie px-2 py-1 text-[13px] outline-none focus:border-acento"
          >
            {PROVEDORES.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </label>

        {!publicada ? (
          <Botao type="submit" disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar rascunho"}
          </Botao>
        ) : null}

        {estado.ok ? <span className="text-[12px] text-sucesso">Salvo.</span> : null}
        {estado.erro ? (
          <span role="alert" className="text-[12px] text-perigo">
            {estado.erro}
          </span>
        ) : null}
      </div>
    </form>
  );
}
