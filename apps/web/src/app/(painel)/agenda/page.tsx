import { lerSessao } from "@/lib/sessao";

// Placeholder da agenda — a agenda real (grade, slots, exclusion constraint)
// é o Bloco 2. Aqui só confirma que o ciclo de identidade fecha: sessão válida,
// tenant e escopos carregados.
export default async function AgendaPage() {
  const sessao = await lerSessao();

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>Agenda</h1>
      <p style={{ color: "#666" }}>
        A grade de horários chega no Bloco 2. Sua conta e empresa já estão ativas.
      </p>
      <div style={{ marginTop: "1.5rem", background: "#f6f6f6", borderRadius: 8, padding: "1rem", fontSize: 14 }}>
        <strong>Sessão ativa</strong>
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem", color: "#444" }}>
          <li>Empresa (tenant): <code>{sessao?.empresaId}</code></li>
          <li>Papel: <code>{sessao?.papelId}</code></li>
          <li>Escopos concedidos: {sessao?.escopos.length}</li>
        </ul>
      </div>
    </div>
  );
}
