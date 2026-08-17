import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { agendaHabilitada } from "@/lib/flags";

// Portão da booking pública.
//
// A página de marcação é a face externa do módulo congelado: ela fica num
// endereço público, divulgável, que sobrevive a qualquer mudança de menu. Tirar
// a agenda do painel e deixar `/agendar/{slug}` no ar seria esconder do dono e
// manter aberto para o mundo — inclusive para links antigos que já circulam.
//
// O layout cobre a página de marcação e a de confirmação de uma vez.
export default function AgendarLayout({ children }: { children: ReactNode }) {
  if (!agendaHabilitada()) notFound();

  return <>{children}</>;
}
