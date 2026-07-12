import { CadastroForm } from "@/modules/identidade/CadastroForm";

export default function CadastroPage() {
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 460, margin: "3rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: 24 }}>Criar sua empresa no atende-ai</h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        Em 30 segundos você tem agenda, página de agendamento e atendimento prontos.
      </p>
      <CadastroForm />
    </main>
  );
}
