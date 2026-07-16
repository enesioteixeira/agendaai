"use client";

import { useActionState, useState } from "react";
import { agendamentoCriarAction, type EstadoAgendaForm } from "./actions";
import { lb, ip, bt, erroTxt } from "./estilos";

export interface OpcaoIdNome {
  id: string;
  nome: string;
}

export function AgendamentoForm({
  profissionais,
  servicos,
  clientes,
  dataInicial,
}: {
  profissionais: OpcaoIdNome[];
  servicos: OpcaoIdNome[];
  clientes: OpcaoIdNome[];
  dataInicial: string;
}) {
  const [estado, action, pending] = useActionState<EstadoAgendaForm, FormData>(
    agendamentoCriarAction,
    {},
  );
  const [clienteNovo, setClienteNovo] = useState(clientes.length === 0);

  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
      <label style={lb}>
        Profissional
        <select name="profissionalId" required style={ip}>
          {profissionais.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
      </label>
      <label style={lb}>
        Serviço
        <select name="servicoId" required style={ip}>
          {servicos.map((s) => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>
      </label>
      <label style={lb}>
        Data
        <input name="data" type="date" required defaultValue={dataInicial} style={ip} />
      </label>
      <label style={lb}>
        Hora
        <input name="hora" type="time" required step={300} style={ip} />
      </label>

      {clienteNovo ? (
        <>
          <label style={lb}>
            Cliente novo
            <input name="clienteNome" placeholder="Nome do cliente" style={{ ...ip, minWidth: 170 }} />
          </label>
          <label style={lb}>
            WhatsApp/telefone
            <input name="clienteTelefone" placeholder="11999998888" style={{ ...ip, width: 140 }} />
          </label>
        </>
      ) : (
        <label style={lb}>
          Cliente
          <select name="clienteId" required style={{ ...ip, minWidth: 180 }}>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
      )}
      {clientes.length > 0 && (
        <button
          type="button"
          onClick={() => setClienteNovo(!clienteNovo)}
          style={{ background: "none", border: "none", color: "#4f7cff", cursor: "pointer", fontSize: 13, paddingBottom: 10 }}
        >
          {clienteNovo ? "usar cliente existente" : "+ cliente novo"}
        </button>
      )}

      <button type="submit" disabled={pending} style={bt}>
        {pending ? "Agendando..." : "Agendar"}
      </button>
      {estado.erro && <p style={erroTxt}>{estado.erro}</p>}
    </form>
  );
}
