import { consultarConvite } from "@atende/db";
import { AceitarConviteForm } from "@/modules/identidade/AceitarConviteForm";

// Página pública de aceite de convite. O token do link É a credencial
// (32 bytes aleatórios, 7 dias, hash no banco). Token inválido/expirado
// mostra aviso — nunca detalhe do porquê (não vazar existência de convite).
export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const convite = await consultarConvite(token);

  if (!convite) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 22 }}>Convite inválido</h1>
        <p style={{ color: "#666" }}>
          Este link de convite não existe, expirou ou já foi utilizado. Peça um novo
          convite para o administrador da empresa.
        </p>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 22 }}>Você foi convidado</h1>
      <p style={{ color: "#444", marginBottom: "1.25rem" }}>
        <strong>{convite.empresaNome}</strong> convidou <strong>{convite.email}</strong> para
        entrar como <strong>{convite.papelNome}</strong>.
      </p>
      {convite.emailJaCadastrado && (
        <p style={{ color: "#666", fontSize: 14 }}>
          Esse e-mail já tem conta no atende-ai — ao aceitar, a empresa é adicionada ao seu acesso.
        </p>
      )}
      <AceitarConviteForm token={token} emailJaCadastrado={convite.emailJaCadastrado} />
    </main>
  );
}

const wrap: React.CSSProperties = {
  fontFamily: "system-ui",
  maxWidth: 420,
  margin: "4rem auto",
  padding: "0 1rem",
};
