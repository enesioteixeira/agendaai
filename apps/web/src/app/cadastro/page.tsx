import Link from "next/link";

import { CadastroForm } from "@/modules/identidade/CadastroForm";

export default function CadastroPage() {
  return (
    <main className="mx-auto max-w-[460px] px-4 py-12">
      <h1 className="text-[24px] font-semibold tracking-tight text-texto">
        Criar sua empresa no Instant Channel
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
