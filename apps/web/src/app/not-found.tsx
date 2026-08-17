import Link from "next/link";

/**
 * 404 do app. Ganha uso imediato: `/atendimento` (a inbox antiga, duplicada)
 * foi removida nesta fase, e quem tiver o link salvo cai aqui em vez de ver a
 * página padrão do Next.
 *
 * Não usa o chassi porque `not-found.tsx` da raiz renderiza fora do layout do
 * painel — sem `globals.css` garantido, os tokens podem não existir.
 */
export default function NaoEncontrado() {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        padding: "1.5rem",
        fontFamily: "system-ui, sans-serif",
        background: "#070b1a",
        color: "#e8ecf7",
      }}
    >
      <div style={{ maxWidth: 380, textAlign: "center" }}>
        <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Página não encontrada</h1>
        <p style={{ fontSize: 13, opacity: 0.75, margin: "0 0 16px", lineHeight: 1.5 }}>
          O endereço não existe ou foi movido.
        </p>
        <Link
          href="/inbox"
          style={{
            display: "inline-block",
            padding: "8px 16px",
            borderRadius: 8,
            background: "#2b5ce6",
            color: "#fff",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          Ir para a Inbox
        </Link>
      </div>
    </div>
  );
}
