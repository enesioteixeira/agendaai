import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { temEscopo } from "@atende/core";
import { EstadoVazio } from "@atende/ui";

import { AbasDaConfiguracao } from "@/modules/atendimento/AbasDaConfiguracao";
import { lerSessao } from "@/lib/sessao";

/**
 * Casca das três telas onde o tenant configura a operação: filas, catálogos e
 * respostas rápidas.
 *
 * O GUARD DE ESCOPO FICA AQUI, e não repetido em cada página, porque as três
 * respondem ao mesmo `atendimento:configurar` — e um guard por página é um guard
 * a menos no dia em que alguém acrescentar a quarta tela. As páginas continuam
 * lendo a sessão por conta própria: elas precisam do `empresaId` para o
 * `runWithTenant`, e tenant vem sempre da sessão (regra inviolável 3), nunca
 * herdado por prop de layout.
 */
export default async function ConfiguracaoDeAtendimentoLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  if (!temEscopo(sessao, "atendimento:configurar")) {
    return (
      <div className="p-4 md:p-6">
        <EstadoVazio
          icone="escudo"
          titulo="Sem acesso à configuração do atendimento"
          descricao="Seu papel não configura filas, catálogos e respostas. Peça a um administrador o escopo atendimento:configurar."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[19px] font-semibold tracking-tight">Atendimento</h1>
        <p className="text-[13px] leading-relaxed text-texto-suave">
          As regras da operação: para onde a conversa vai, em quanto tempo precisa de resposta, por
          que ela termina e o que o time responde sem redigitar.
        </p>
      </header>

      <AbasDaConfiguracao />

      {children}
    </div>
  );
}
