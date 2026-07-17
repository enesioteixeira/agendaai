"use client";

// Polling do painel de atendimento (doc 05: fallback 5s — vira SSE quando o
// worker tiver host público, doc 11). router.refresh() rebusca os server
// components sem perder o estado do input.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ intervaloMs = 5000 }: { intervaloMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervaloMs);
    return () => clearInterval(id);
  }, [router, intervaloMs]);
  return null;
}
