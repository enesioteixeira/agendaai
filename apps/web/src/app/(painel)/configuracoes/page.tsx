import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { temEscopo } from "@atende/core";
import { runWithTenant, listarEquipe } from "@atende/db";
import { ConvidarForm } from "@/modules/identidade/ConvidarForm";

// Configurações → Equipe (config:usuarios). Server component: busca sob o
// tenant da sessão; quem não tem o escopo vê a página em modo leitura negada.
export default async function ConfiguracoesPage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  if (!temEscopo(sessao, "config:usuarios")) {
    return (
      <div>
        <h1 style={{ fontSize: 22 }}>Configurações</h1>
        <p style={{ color: "#c0362c" }}>Seu papel não tem acesso à gestão de usuários (escopo config:usuarios).</p>
      </div>
    );
  }

  const equipe = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    () => listarEquipe(),
  );

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 760 }}>
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Equipe</h1>
        <p style={{ color: "#666", margin: 0 }}>Convide pessoas e defina o papel de cada uma.</p>
      </div>

      <section>
        <h2 style={h2}>Convidar</h2>
        <ConvidarForm papeis={equipe.papeis} />
      </section>

      {equipe.convitesPendentes.length > 0 && (
        <section>
          <h2 style={h2}>Convites pendentes</h2>
          <table style={tb}>
            <thead>
              <tr><th style={th}>E-mail</th><th style={th}>Papel</th><th style={th}>Expira em</th></tr>
            </thead>
            <tbody>
              {equipe.convitesPendentes.map((c) => (
                <tr key={c.id}>
                  <td style={td}>{c.email}</td>
                  <td style={td}>{c.papelNome}</td>
                  <td style={td}>{new Date(c.expiraEm).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2 style={h2}>Membros ({equipe.membros.length})</h2>
        <table style={tb}>
          <thead>
            <tr><th style={th}>Nome</th><th style={th}>E-mail</th><th style={th}>Papel</th><th style={th}>Status</th></tr>
          </thead>
          <tbody>
            {equipe.membros.map((m) => (
              <tr key={m.vinculoId}>
                <td style={td}>{m.nome}</td>
                <td style={td}>{m.email}</td>
                <td style={td}>{m.papelNome}</td>
                <td style={td}>{m.ativo ? "Ativo" : "Inativo"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const h2: React.CSSProperties = { fontSize: 16, marginBottom: 8 };
const tb: React.CSSProperties = { borderCollapse: "collapse", width: "100%", fontSize: 14 };
const th: React.CSSProperties = { textAlign: "left", borderBottom: "2px solid #ddd", padding: "0.4rem 0.6rem", color: "#555" };
const td: React.CSSProperties = { borderBottom: "1px solid #eee", padding: "0.45rem 0.6rem" };
