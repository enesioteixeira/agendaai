import Link from "next/link";

import { cadastroAberto } from "@/lib/flags";

import "./globals.css";

export const metadata = {
  title: "Instant Channel",
  description: "Atendimento e venda por conversa, em todos os canais.",
};

/**
 * Homepage pública.
 *
 * Substitui o stub "Fundações (Bloco 0) em construção", que era o que qualquer
 * visitante via ao abrir o domínio — sem sequer um link para entrar. Não é uma
 * página de marketing: é o mínimo para a porta da frente não mentir sobre o
 * estado do produto e levar quem chega ao lugar certo.
 */
export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center bg-fundo p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="marca-simbolo grid h-11 w-11 place-items-center rounded-2 text-[18px] font-bold"
          >
            IC
          </span>
          <span className="text-[22px] font-semibold tracking-tight text-texto">
            Instant Channel
          </span>
        </div>

        <p className="text-[14px] leading-relaxed text-texto-suave">
          Atenda e venda pela conversa — WhatsApp, Instagram, Messenger e mais, numa
          caixa de entrada só, com agentes de IA que sua empresa cria e treina.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link href="/login" className="ie-botao ie-botao--primario">
            Entrar
          </Link>
          <Link href="/cadastro" className="ie-botao">
            {cadastroAberto() ? "Criar conta" : "Pedir acesso"}
          </Link>
        </div>
      </div>
    </main>
  );
}
