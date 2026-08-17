import Link from "next/link";

import { cadastroAberto } from "@/lib/flags";

import { LoginForm } from "@/modules/identidade/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;

  return (
    <main className="mx-auto max-w-[380px] px-4 py-16">
      <h1 className="text-[24px] font-semibold tracking-tight text-texto">Entrar</h1>
      <p className="mb-6 mt-1 text-[13px] text-texto-suave">Acesse o painel da sua empresa.</p>

      {/* O painel derruba a sessão quando o tenant do JWT não existe mais
          (empresa removida, ambiente recriado). Sem esta explicação, o usuário
          é devolvido ao login sem saber por quê e tenta a mesma senha de novo. */}
      {motivo === "sessao-invalida" ? (
        <div
          role="status"
          className="mb-4 rounded-2 border border-atencao bg-atencao-fraco px-3 py-2 text-[12px] leading-relaxed text-texto"
        >
          Sua sessão não vale mais — a empresa vinculada a ela não está mais disponível.
          Entre de novo com outra conta.
        </div>
      ) : null}

      <LoginForm />

      <p className="mt-6 text-[12px] text-texto-suave">
        {cadastroAberto() ? (
          <>
            Não tem conta?{" "}
            <Link href="/cadastro" className="text-acento underline">
              Criar agora
            </Link>
          </>
        ) : (
          <>
            Não tem conta? As contas são criadas por convite —{" "}
            <Link href="/cadastro" className="text-acento underline">
              saiba como receber o seu acesso
            </Link>
          </>
        )}
      </p>
    </main>
  );
}
