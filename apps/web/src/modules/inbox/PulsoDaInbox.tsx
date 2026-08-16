"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { pulsoDaInbox } from "./pulso";

/**
 * Mantém a inbox fresca sem repintar a tela à toa.
 *
 * A cada `intervaloMs` pergunta a assinatura do estado (ver `pulso.ts`) e só
 * chama `router.refresh()` quando ela muda. Três cuidados que a versão anterior
 * (refresh cego) não tinha:
 *
 * - **Aba escondida não consulta.** `document.hidden` corta o trabalho de quem
 *   deixou o painel aberto num monitor secundário — que, num time de
 *   atendimento, é quase todo mundo o tempo todo.
 * - **Um tick por vez.** Se uma consulta demora mais que o intervalo, a próxima
 *   não empilha; senão uma lentidão momentânea vira uma fila de requisições que
 *   piora exatamente o que estava lento.
 * - **Falha é silenciosa e não desiste.** Rede oscilando não pode parar o
 *   polling nem encher o console — a próxima tentativa resolve.
 */
export function PulsoDaInbox({ intervaloMs = 3000 }: { readonly intervaloMs?: number }) {
  const router = useRouter();
  const ultimo = useRef<string | null>(null);
  const emVoo = useRef(false);

  useEffect(() => {
    let vivo = true;

    async function tique() {
      if (!vivo || emVoo.current || document.hidden) return;
      emVoo.current = true;
      try {
        const atual = await pulsoDaInbox();
        if (!vivo) return;
        // O primeiro tique só registra a linha de base: a tela acabou de ser
        // renderizada pelo servidor, e um refresh aqui seria trabalho puro.
        if (ultimo.current !== null && ultimo.current !== atual) router.refresh();
        ultimo.current = atual;
      } catch {
        /* rede oscilando: o próximo tique tenta de novo */
      } finally {
        emVoo.current = false;
      }
    }

    const id = setInterval(tique, intervaloMs);
    // Voltar para a aba deve mostrar o estado atual na hora, não daqui a 3 s.
    const aoVoltar = () => {
      if (!document.hidden) void tique();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    void tique();

    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [router, intervaloMs]);

  return null;
}
