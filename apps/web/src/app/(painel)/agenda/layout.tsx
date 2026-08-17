import type { ReactNode } from "react";

// Sub-navegação da Agenda: grade (B3) + configuração do catálogo (B2).
export default function AgendaLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: "1.25rem" }} className="p-4 md:p-6">
      {/* `flexWrap` porque cinco abas em linha estouram o viewport do celular —
          antes disso, a última ("Horário de funcionamento") ficava fora da tela
          sem nenhuma indicação de que existia. */}
      <nav
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          borderBottom: "1px solid var(--borda)",
          paddingBottom: 8,
        }}
      >
        <Aba href="/agenda" rotulo="Grade" />
        <Aba href="/agenda/servicos" rotulo="Serviços" />
        <Aba href="/agenda/profissionais" rotulo="Profissionais" />
        <Aba href="/agenda/recursos" rotulo="Salas & bloqueios" />
        <Aba href="/agenda/unidade" rotulo="Horário de funcionamento" />
      </nav>
      {children}
    </div>
  );
}

function Aba({ href, rotulo }: { href: string; rotulo: string }) {
  return (
    <a
      href={href}
      style={{
        color: "var(--texto)",
        textDecoration: "none",
        padding: "0.35rem 0.7rem",
        borderRadius: 6,
        fontSize: 14,
        background: "var(--superficie-2)",
      }}
    >
      {rotulo}
    </a>
  );
}
