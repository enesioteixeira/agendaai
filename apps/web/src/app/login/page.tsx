import { LoginForm } from "@/modules/identidade/LoginForm";

export default function LoginPage() {
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 380, margin: "4rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: 24 }}>Entrar</h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>Acesse o painel da sua empresa.</p>
      <LoginForm />
    </main>
  );
}
