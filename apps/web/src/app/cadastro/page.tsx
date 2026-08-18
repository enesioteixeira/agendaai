import Link from "next/link";

import { CadastroForm } from "@/modules/identidade/CadastroForm";
import { cadastroAberto } from "@/lib/flags";

export default function CadastroPage() {
  // Fechado, a página não some: ela explica. Um 404 aqui deixaria quem clicou
  // no link de uma proposta ou de um e-mail achando que o produto quebrou —
  // e o link existe, circula, e não some quando a gente muda de ideia.
  if (!cadastroAberto()) {
    return (
      <main className="mx-auto max-w-[460px] px-4 py-12">
        <h1 className="text-[24px] font-semibold tracking-tight text-texto">
          As contas são criadas por convite
        </h1>
        <p className="mb-6 mt-1 text-[13px] leading-relaxed text-texto-suave">
          O Mensvra Channel está sendo implantado com um grupo pequeno de distribuidores, um a um,
          para que cada operação suba do jeito certo. Fale com a gente e a gente te manda o acesso.
        </p>
        <p className="text-[12px] text-texto-suave">
          Já tem conta?{" "}
          <Link href="/login" className="text-acento underline">
            Entrar
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[460px] px-4 py-12">
      <h1 className="text-[24px] font-semibold tracking-tight text-texto">
        Criar sua empresa no Mensvra Channel
      </h1>
      <p className="mb-6 mt-1 text-[13px] leading-relaxed text-texto-suave">
        Você sai daqui com a caixa de entrada pronta para conectar o WhatsApp.
      </p>

      <CadastroForm />

      <p className="mt-6 text-[12px] text-texto-suave">
        Já tem conta?{" "}
        <Link href="/login" className="text-acento underline">
          Entrar
        </Link>
      </p>
    </main>
  );
}
