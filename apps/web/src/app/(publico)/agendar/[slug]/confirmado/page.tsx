import { notFound } from "next/navigation";
import { runWithTenant, prisma, resolverEmpresaPorSlug } from "@atende/db";
import { horaNoFuso, dataNoFuso } from "@atende/core";

// Confirmação da booking. Mostra APENAS o agendamento cujo id veio do
// redirect, resolvido sob o tenant do slug — id de outro tenant cai no
// notFound pela própria extension (where empresaId injetado).
export default async function ConfirmadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ id?: string }>;
}) {
  const { slug } = await params;
  const { id } = await searchParams;
  if (!id) notFound();

  const empresa = await resolverEmpresaPorSlug(slug);
  if (!empresa) notFound();

  const agendamento = await runWithTenant({ empresaId: empresa.empresaId }, () =>
    prisma.agendamento.findUnique({
      where: { id },
      include: { servico: true, profissional: true, unidade: true },
    }),
  );
  if (!agendamento) notFound();

  const fuso = agendamento.unidade.fusoHorario;
  const data = dataNoFuso(agendamento.inicio, fuso);

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 560, margin: "0 auto", padding: "3rem 1rem", display: "grid", gap: "1rem", textAlign: "center" }}>
      <div style={{ fontSize: 48 }}>✅</div>
      <h1 style={{ fontSize: 22, margin: 0 }}>Horário confirmado!</h1>
      <p style={{ color: "#444", margin: 0, fontSize: 16 }}>
        <strong>{agendamento.servico.nome}</strong> com <strong>{agendamento.profissional.nome}</strong>
        <br />
        {`${data.slice(8)}/${data.slice(5, 7)}/${data.slice(0, 4)}`} às {horaNoFuso(agendamento.inicio, fuso)}
      </p>
      <p style={{ color: "#666", fontSize: 14 }}>
        {empresa.nome} · Guarde este comprovante. Se precisar remarcar, entre em contato com o estabelecimento.
      </p>
      <p style={{ margin: 0 }}>
        <a href={`/agendar/${slug}`} style={{ color: "#4f7cff" }}>Fazer outro agendamento</a>
      </p>
    </main>
  );
}
