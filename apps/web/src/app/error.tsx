"use client";

import { useEffect } from "react";

/**
 * Boundary global. Sem ele, qualquer `throw` de server action vira a tela de
 * erro genérica do Next — e várias actions deste app lançam em caminho NORMAL
 * (dois atendentes assumindo a mesma conversa, por exemplo).
 *
 * As actions que erram por corrida foram corrigidas para devolver estado em vez
 * de lançar; este boundary é a rede para o que sobra: falha de banco, bug real.
 * Por isso o texto não promete que "não foi nada" — oferece tentar de novo e
 * seguir para a inbox.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[erro]", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          padding: "1.5rem",
          fontFamily: "system-ui, sans-serif",
          background: "#070b1a",
          color: "#e8ecf7",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Algo deu errado</h1>
          <p style={{ fontSize: 13, opacity: 0.75, margin: "0 0 16px", lineHeight: 1.5 }}>
            A tela não conseguiu carregar. Você pode tentar de novo — se persistir, o
            problema está do nosso lado.
          </p>
          {/* O digest é o que liga esta tela ao log do servidor. Sem ele, o
              relato do usuário ("deu erro") não tem como ser rastreado. */}
          {error.digest ? (
            <p style={{ fontSize: 11, opacity: 0.5, margin: "0 0 16px" }}>
              Código: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "#2b5ce6",
              color: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
