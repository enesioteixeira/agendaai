import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { logoutAction } from "@/modules/identidade/actions";

// Layout do painel — porta de entrada autenticada. Sem sessão válida, redireciona
// para /login. A identidade do tenant vem SEMPRE daqui (sessão JWT), nunca de
// URL ou input (regra inviolável 3).
export default async function PainelLayout({ children }: { children: ReactNode }) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  return (
    <div style={{ fontFamily: "system-ui", display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "100vh" }}>
      <aside style={{ background: "#141414", color: "#eee", padding: "1.25rem 1rem" }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: "1.5rem" }}>atende-ai</div>
        <nav style={{ display: "grid", gap: 4, fontSize: 15 }}>
          <NavLink href="/agenda" rotulo="Agenda" />
          <NavLink href="/clientes" rotulo="Clientes" />
          <NavLink href="/atendimento" rotulo="Atendimento" />
          <NavLink href="/financeiro" rotulo="Financeiro" />
          <NavLink href="/configuracoes" rotulo="Configurações" />
        </nav>
        <form action={logoutAction} style={{ marginTop: "2rem" }}>
          <button type="submit" style={{ background: "none", border: "1px solid #444", color: "#bbb", borderRadius: 6, padding: "0.4rem 0.7rem", cursor: "pointer", fontSize: 14 }}>
            Sair
          </button>
        </form>
      </aside>
      <main style={{ padding: "2rem" }}>{children}</main>
    </div>
  );
}

function NavLink({ href, rotulo }: { href: string; rotulo: string }) {
  return (
    <a href={href} style={{ color: "#ddd", textDecoration: "none", padding: "0.4rem 0.6rem", borderRadius: 6 }}>
      {rotulo}
    </a>
  );
}
