import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { temEscopo } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { ServicoForm } from "@/modules/agenda/ServicoForm";
import { servicoAlternarAtivoAction } from "@/modules/agenda/actions";
import { tb, th, td, btSec } from "@/modules/agenda/estilos";

// Catálogo de serviços (agenda:configurar p/ mexer; agenda:ler p/ ver).
export default async function ServicosPage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  const servicos = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    () => prisma.servico.findMany({ orderBy: { nome: "asc" } }),
  );
  const podeConfigurar = temEscopo(sessao, "agenda:configurar");

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Serviços</h1>
        <p style={{ color: "#666", margin: 0 }}>
          O que a sua empresa oferece — duração e preço alimentam a agenda e a booking.
        </p>
      </div>

      {podeConfigurar && (
        <section>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Novo serviço</h2>
          <ServicoForm />
        </section>
      )}

      <section>
        <table style={tb}>
          <thead>
            <tr>
              <th style={th}>Serviço</th>
              <th style={th}>Duração</th>
              <th style={th}>Preço</th>
              <th style={th}>Booking</th>
              <th style={th}>Status</th>
              {podeConfigurar && <th style={th} />}
            </tr>
          </thead>
          <tbody>
            {servicos.length === 0 && (
              <tr><td style={td} colSpan={6}>Nenhum serviço ainda — cadastre o primeiro acima.</td></tr>
            )}
            {servicos.map((s) => (
              <tr key={s.id} style={s.ativo ? undefined : { opacity: 0.5 }}>
                <td style={td}>{s.nome}</td>
                <td style={td}>{s.duracaoMin} min</td>
                <td style={td}>
                  {(s.precoCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
                <td style={td}>{s.visivelNaBooking ? "Visível" : "Oculto"}</td>
                <td style={td}>{s.ativo ? "Ativo" : "Inativo"}</td>
                {podeConfigurar && (
                  <td style={{ ...td, display: "flex", gap: 6 }}>
                    <details>
                      <summary style={{ cursor: "pointer", fontSize: 13 }}>Editar</summary>
                      <div style={{ padding: "0.75rem 0" }}>
                        <ServicoForm servico={s} />
                      </div>
                    </details>
                    <form action={servicoAlternarAtivoAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="ativo" value={String(!s.ativo)} />
                      <button type="submit" style={{ ...btSec, padding: "0.2rem 0.5rem", fontSize: 13 }}>
                        {s.ativo ? "Desativar" : "Reativar"}
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
