import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { temEscopo } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { ClienteForm } from "@/modules/agenda/ClienteForm";
import { tb, th, td } from "@/modules/agenda/estilos";

// Clientes — versão mínima do Bloco 2 (cadastro p/ agendar). O módulo completo
// (IdentidadeCanal, timeline, tags, merge) chega no Bloco 3 com o omnichannel.
export default async function ClientesPage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  if (!temEscopo(sessao, "clientes:ler")) {
    return (
      <div>
        <h1 style={{ fontSize: 22 }}>Clientes</h1>
        <p style={{ color: "#c0362c" }}>Seu papel não tem acesso a clientes (escopo clientes:ler).</p>
      </div>
    );
  }

  const clientes = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    () =>
      prisma.cliente.findMany({
        where: { deletedAt: null },
        orderBy: { nome: "asc" },
        take: 500,
        include: { agendamentos: { orderBy: { inicio: "desc" }, take: 1 } },
      }),
  );
  const podeCriar = temEscopo(sessao, "clientes:criar");

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 860 }}>
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Clientes</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Cadastro básico — histórico completo e conversas chegam com o atendimento (Bloco 3).
        </p>
      </div>

      {podeCriar && (
        <section>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Novo cliente</h2>
          <ClienteForm />
        </section>
      )}

      <section>
        <table style={tb}>
          <thead>
            <tr>
              <th style={th}>Nome</th>
              <th style={th}>Telefone</th>
              <th style={th}>E-mail</th>
              <th style={th}>Último agendamento</th>
            </tr>
          </thead>
          <tbody>
            {clientes.length === 0 && (
              <tr><td style={td} colSpan={4}>Nenhum cliente ainda.</td></tr>
            )}
            {clientes.map((c) => (
              <tr key={c.id}>
                <td style={td}>{c.nome}{c.provisorio ? " (provisório)" : ""}</td>
                <td style={td}>{c.telefone ?? "—"}</td>
                <td style={td}>{c.email ?? "—"}</td>
                <td style={td}>
                  {c.agendamentos[0]
                    ? c.agendamentos[0].inicio.toLocaleDateString("pt-BR")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
