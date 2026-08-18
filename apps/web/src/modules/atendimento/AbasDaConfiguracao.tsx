"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@atende/ui";

/**
 * As três telas da configuração do atendimento, como abas de navegação.
 *
 * NÃO é o `AbasInternas` do chassi: aquele troca de painel na mesma página e
 * guarda a aba em estado. Aqui cada aba é uma ROTA — o link é compartilhável, o
 * voltar do navegador funciona e cada tela carrega só o seu dado. O componente é
 * de cliente por um motivo só, o mesmo do `NavLateral`: marcar a aba ativa exige
 * a rota corrente, e `usePathname` é hook.
 */

const ABAS = [
  { href: "/configuracoes/atendimento/filas", rotulo: "Filas" },
  { href: "/configuracoes/atendimento/catalogos", rotulo: "Motivos e etiquetas" },
  { href: "/configuracoes/atendimento/respostas", rotulo: "Respostas rápidas" },
] as const;

export function AbasDaConfiguracao() {
  const rota = usePathname();

  return (
    <nav
      aria-label="Seções da configuração de atendimento"
      className="flex flex-wrap gap-1 border-b border-borda"
    >
      {ABAS.map((aba) => {
        // Comparação exata: as três são rotas irmãs, sem sub-rota abaixo delas.
        const ativa = rota === aba.href;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors",
              ativa
                ? "border-acento font-semibold text-acento"
                : "border-transparent text-texto-suave hover:text-texto",
            )}
          >
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
