import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SCRIPT_DE_TEMA } from "@/componentes/tema";

import "./globals.css";
// DEPOIS de globals.css de propósito. O `@import 'tailwindcss'` do app traz o preflight,
// que zera margem, borda e aparência de elementos nativos; carregado por último, ele
// desfaria as regras do chassi (que tem a mesma especificidade de classe) e a tela
// renderizaria sem borda nem espaçamento — parecendo estilo faltando, não ordem trocada.
import "@atende/ui/estilos.css";

export const metadata: Metadata = {
  title: "Mensvra Channel",
  description:
    "Atendimento e venda por conversa: WhatsApp, Instagram, Messenger e mais, com agentes de IA e integração nativa ao Mensvra ERP.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `suppressHydrationWarning` porque o script do `<head>` escreve a classe `dark`
    // no `<html>` antes do React montar: o servidor não a emite, e sem isto o React
    // acusa divergência num atributo que ele mesmo não deve controlar.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DE_TEMA }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
