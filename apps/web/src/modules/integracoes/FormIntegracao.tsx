"use client";

import { useActionState, useState } from "react";

import { Botao } from "@atende/ui";

import { conectarIntegracaoAction, type EstadoIntegracao } from "./actions";

/**
 * O catálogo do que dá para conectar HOJE, e o que ainda não.
 *
 * Mostrar o que não existe, esmaecido e com motivo, é melhor que esconder: o
 * usuário precisa saber se vale esperar ou se deve procurar outra saída. Cada
 * driver de mercado depende de credencial de sandbox do fornecedor — não é
 * trabalho que se faz "quando der", é bloqueio externo.
 */
const CATALOGO = [
  {
    categoria: "erp" as const,
    tipo: "mensvra_erp",
    rotulo: "Mensvra ERP",
    nota: "Integração nativa da família Mensvra",
    disponivel: true,
  },
  { categoria: "erp" as const, tipo: "sankhya", rotulo: "Sankhya", nota: "Driver ainda não escrito", disponivel: false },
  { categoria: "erp" as const, tipo: "omie", rotulo: "Omie", nota: "Driver ainda não escrito", disponivel: false },
  { categoria: "erp" as const, tipo: "bling", rotulo: "Bling", nota: "Driver ainda não escrito", disponivel: false },
  { categoria: "crm" as const, tipo: "ploomes", rotulo: "Ploomes", nota: "Driver ainda não escrito", disponivel: false },
  { categoria: "crm" as const, tipo: "rd_station", rotulo: "RD Station", nota: "Driver ainda não escrito", disponivel: false },
  { categoria: "pagamento" as const, tipo: "asaas", rotulo: "Asaas", nota: "Fase F", disponivel: false },
];

export function FormConectar() {
  const [estado, action, enviando] = useActionState<EstadoIntegracao, FormData>(
    conectarIntegracaoAction,
    {},
  );
  const [escolhido, setEscolhido] = useState(CATALOGO[0]!);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-2 border border-borda bg-superficie p-4">
      <input type="hidden" name="categoria" value={escolhido.categoria} />
      <input type="hidden" name="tipo" value={escolhido.tipo} />

      <div className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-texto-suave">Sistema</span>
        <div className="flex flex-wrap gap-1.5">
          {CATALOGO.map((c) => (
            <button
              key={c.tipo}
              type="button"
              disabled={!c.disponivel}
              onClick={() => setEscolhido(c)}
              title={c.nota}
              className={`ie-chip ${escolhido.tipo === c.tipo ? "ie-chip--ativo" : ""} ${
                c.disponivel ? "" : "cursor-not-allowed opacity-50"
              }`}
            >
              {c.rotulo}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-texto-fraco">{escolhido.nota}</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="nome" className="text-[12px] font-semibold text-texto-suave">
          Como chamar esta conexão
        </label>
        <input
          id="nome"
          name="nome"
          required
          defaultValue={escolhido.rotulo}
          key={escolhido.tipo}
          className="rounded-2 border border-borda bg-superficie-2 px-3 py-2 text-[13px] outline-none focus:border-acento"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="baseUrl" className="text-[12px] font-semibold text-texto-suave">
          URL da API <span className="font-normal text-texto-fraco">(opcional)</span>
        </label>
        <input
          id="baseUrl"
          name="baseUrl"
          placeholder="https://erp.suaempresa.com.br/api"
          className="rounded-2 border border-borda bg-superficie-2 px-3 py-2 text-[13px] outline-none focus:border-acento"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="apiKey" className="text-[12px] font-semibold text-texto-suave">
          Chave de API
        </label>
        <input
          id="apiKey"
          name="apiKey"
          type="password"
          required
          minLength={8}
          autoComplete="off"
          placeholder="iep_live_…"
          className="rounded-2 border border-borda bg-superficie-2 px-3 py-2 font-mono text-[13px] outline-none focus:border-acento"
        />
        <p className="text-[11px] text-texto-fraco">
          É a chave do <strong>seu</strong> tenant no sistema de destino. Fica cifrada e nunca mais
          aparece nesta tela — para trocar, basta enviar uma nova.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Conectando…" : "Conectar"}
        </Botao>
        {estado.ok ? <span className="text-[12px] text-sucesso">Conectado.</span> : null}
        {estado.erro ? (
          <span role="alert" className="text-[12px] text-perigo">
            {estado.erro}
          </span>
        ) : null}
      </div>
    </form>
  );
}
