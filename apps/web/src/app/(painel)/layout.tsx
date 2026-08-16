import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AlternadorDeTema } from "@/componentes/AlternadorDeTema";
import { NavLateral, type GrupoDeNavegacao } from "@/componentes/NavLateral";
import { lerSessao } from "@/lib/sessao";
import { logoutAction } from "@/modules/identidade/actions";

// A navegação do produto. A ordem conta a história do Instant Channel: a conversa
// primeiro (é o centro de gravidade), depois quem/o que atende (agentes, catálogo),
// depois o encanamento (canais, integrações, chaves).
//
// `ativo: false` marca módulo ainda não entregue. Preferimos mostrá-lo esmaecido a
// escondê-lo: o painel comunica para onde o produto vai, e um item que aparece só no
// dia da entrega faz o usuário reaprender a navegação a cada release.
const GRUPOS: readonly GrupoDeNavegacao[] = [
  {
    titulo: "Atender",
    itens: [
      { href: "/inbox", rotulo: "Inbox", icone: "conversa" },
      { href: "/clientes", rotulo: "Contatos", icone: "pessoas" },
    ],
  },
  {
    titulo: "Vender",
    itens: [
      { href: "/catalogo", rotulo: "Catálogo", icone: "etiqueta", ativo: false, selo: "em breve" },
      { href: "/pedidos", rotulo: "Pedidos", icone: "carrinho", ativo: false, selo: "em breve" },
    ],
  },
  {
    titulo: "Automatizar",
    itens: [
      { href: "/agentes", rotulo: "Agentes de IA", icone: "agente", ativo: false, selo: "em breve" },
      { href: "/conhecimento", rotulo: "Conhecimento", icone: "livro", ativo: false, selo: "em breve" },
    ],
  },
  {
    titulo: "Configurar",
    itens: [
      { href: "/configuracoes/canais", rotulo: "Canais", icone: "antena" },
      { href: "/integracoes", rotulo: "Integrações", icone: "plugue", ativo: false, selo: "em breve" },
      { href: "/configuracoes", rotulo: "Configurações", icone: "engrenagem" },
    ],
  },
];

// Layout do painel — porta de entrada autenticada. Sem sessão válida, redireciona
// para /login. A identidade do tenant vem SEMPRE daqui (sessão JWT), nunca de
// URL ou input (regra inviolável 3).
export default async function PainelLayout({ children }: { children: ReactNode }) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  return (
    <div className="grid h-full min-h-screen grid-cols-[232px_1fr] bg-fundo">
      <aside className="flex flex-col gap-6 overflow-y-auto border-r border-borda bg-superficie p-4 barra-fina">
        <div className="flex items-center gap-2.5 px-1">
          <span
            aria-hidden
            className="marca-simbolo grid h-8 w-8 place-items-center rounded-2 text-[15px] font-bold"
          >
            IC
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-texto">
            Instant Channel
          </span>
        </div>

        <NavLateral grupos={GRUPOS} />

        <div className="mt-auto flex flex-col gap-3 border-t border-borda pt-3">
          <AlternadorDeTema />
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded-2 border border-borda px-2.5 py-1.5 text-[13px] text-texto-suave transition-colors hover:border-borda-forte hover:text-texto"
            >
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 overflow-auto barra-fina">{children}</main>
    </div>
  );
}
