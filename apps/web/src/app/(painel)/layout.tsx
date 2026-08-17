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
      { href: "/agentes", rotulo: "Agentes de IA", icone: "agente" },
      { href: "/conhecimento", rotulo: "Conhecimento", icone: "livro", ativo: false, selo: "em breve" },
    ],
  },
  {
    titulo: "Configurar",
    itens: [
      { href: "/configuracoes/canais", rotulo: "Canais", icone: "antena" },
      { href: "/integracoes", rotulo: "Integrações", icone: "plugue" },
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

  const marca = (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="marca-simbolo grid h-8 w-8 shrink-0 place-items-center rounded-2 text-[15px] font-bold"
      >
        IC
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-texto">Instant Channel</span>
    </div>
  );

  const rodape = (
    <div className="flex flex-col gap-3 border-t border-borda pt-3">
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
  );

  return (
    // Uma coluna no celular, duas a partir de `md`. A versão anterior fixava
    // 232px + 1fr em qualquer largura: no celular a lateral tomava a tela e o
    // conteúdo ficava fora do viewport, sem nem dar para rolar até ele.
    <div className="grid h-full min-h-screen grid-cols-1 bg-fundo md:grid-cols-[232px_1fr]">
      {/* CELULAR — barra no topo com menu recolhível.
          `<details>` nativo, e não estado de React: o layout é server component,
          e um menu que depende de JS deixaria a navegação inacessível enquanto
          o bundle carrega — justamente em conexão ruim, que é onde mais dói. */}
      <details className="group border-b border-borda bg-superficie md:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between p-3 [&::-webkit-details-marker]:hidden">
          {marca}
          <span className="rounded-2 border border-borda px-2 py-1 text-[12px] text-texto-suave">
            <span className="group-open:hidden">Menu</span>
            <span className="hidden group-open:inline">Fechar</span>
          </span>
        </summary>
        <div className="flex flex-col gap-4 px-3 pb-3">
          <NavLateral grupos={GRUPOS} />
          {rodape}
        </div>
      </details>

      {/* DESKTOP — lateral fixa. */}
      <aside className="hidden flex-col gap-6 overflow-y-auto border-r border-borda bg-superficie p-4 barra-fina md:flex">
        <div className="px-1">{marca}</div>
        <NavLateral grupos={GRUPOS} />
        <div className="mt-auto">{rodape}</div>
      </aside>

      {/* `min-h-0` deixa o filho rolar sozinho em vez de esticar a página — sem
          ele, a inbox de altura total empurra o layout e o topo some. */}
      <main className="min-h-0 min-w-0 overflow-auto barra-fina">{children}</main>
    </div>
  );
}
