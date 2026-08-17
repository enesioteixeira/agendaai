"use client";

import { useEffect } from "react";

import { Botao, EstadoVazio } from "@atende/ui";

/**
 * Boundary do painel. Diferente do global, este roda DENTRO do layout — a
 * navegação lateral continua visível, então o usuário sai daqui por conta
 * própria em vez de ficar preso numa tela cheia.
 */
export default function ErroDoPainel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[painel]", error);
  }, [error]);

  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="flex flex-col items-center gap-3">
        <EstadoVazio
          icone="alerta"
          titulo="Não consegui carregar esta tela"
          descricao={
            error.digest
              ? `Tente de novo. Se continuar, informe o código ${error.digest}.`
              : "Tente de novo. Se continuar, o problema está do nosso lado."
          }
        />
        <Botao variante="primario" onClick={reset}>
          Tentar de novo
        </Botao>
      </div>
    </div>
  );
}
