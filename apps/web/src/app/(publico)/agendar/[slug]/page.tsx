import { notFound } from "next/navigation";
import { catalogoBooking, slotsBooking } from "@atende/db";
import { dataNoFuso, adicionarDias } from "@atende/core";
import { BookingForm } from "@/modules/booking/BookingForm";

// Booking pública white-label (B4 — doc 04 §2.3). SEM sessão: o tenant vem do
// slug no path (provisório até o domínio próprio; depois vira
// {slug}.dominio.com.br por hostname — a lógica de resolução é a mesma).
// Fluxo por searchParams server-rendered: serviço → profissional → dia →
// horário → nome/WhatsApp (BookingForm).
export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ servicoId?: string; profissionalId?: string; data?: string; hora?: string }>;
}) {
  const { slug } = await params;
  const q = await searchParams;

  const catalogo = await catalogoBooking(slug);
  if (!catalogo) notFound();
  const { empresa, servicos, profissionais } = catalogo;

  const servico = servicos.find((s) => s.id === q.servicoId);
  const profissional = profissionais.find((p) => p.id === q.profissionalId);

  const base = `/agendar/${slug}`;
  const hoje = dataNoFuso(new Date(), "America/Sao_Paulo");
  const proximosDias = Array.from({ length: 14 }, (_, i) => adicionarDias(hoje, i));

  // Slots só quando o fluxo está completo até a data
  const slots =
    servico && profissional && q.data
      ? await slotsBooking(slug, servico.id, profissional.id, q.data)
      : null;

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 560, margin: "0 auto", padding: "2rem 1rem", display: "grid", gap: "1.5rem" }}>
      <header>
        <h1 style={{ fontSize: 24, margin: 0 }}>{empresa.nome}</h1>
        <p style={{ color: "#666", margin: "4px 0 0" }}>Agende seu horário em poucos cliques.</p>
      </header>

      <section style={{ display: "grid", gap: 8 }}>
        <h2 style={h2}>1. Serviço</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {servicos.length === 0 && <p style={{ color: "#666", margin: 0 }}>Nenhum serviço disponível no momento.</p>}
          {servicos.map((s) => (
            <a key={s.id} href={`${base}?servicoId=${s.id}`} style={s.id === servico?.id ? chipAtivo : chip}>
              {s.nome} · {(s.precoCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </a>
          ))}
        </div>
      </section>

      {servico && (
        <section style={{ display: "grid", gap: 8 }}>
          <h2 style={h2}>2. Profissional</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {profissionais.map((p) => (
              <a
                key={p.id}
                href={`${base}?servicoId=${servico.id}&profissionalId=${p.id}`}
                style={p.id === profissional?.id ? chipAtivo : chip}
              >
                {p.nome}
              </a>
            ))}
          </div>
        </section>
      )}

      {servico && profissional && (
        <section style={{ display: "grid", gap: 8 }}>
          <h2 style={h2}>3. Dia</h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {proximosDias.map((d) => (
              <a
                key={d}
                href={`${base}?servicoId=${servico.id}&profissionalId=${profissional.id}&data=${d}`}
                style={d === q.data ? chipAtivo : chip}
              >
                {`${d.slice(8)}/${d.slice(5, 7)}`}
              </a>
            ))}
          </div>
        </section>
      )}

      {servico && profissional && q.data && (
        <section style={{ display: "grid", gap: 8 }}>
          <h2 style={h2}>4. Horário</h2>
          {!slots || slots.slots.length === 0 ? (
            <p style={{ color: "#666", margin: 0 }}>Sem horários livres nesse dia — tente outro.</p>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {slots.slots.map((h) => (
                <a
                  key={h}
                  href={`${base}?servicoId=${servico.id}&profissionalId=${profissional.id}&data=${q.data}&hora=${encodeURIComponent(h)}`}
                  style={h === q.hora ? chipAtivo : chip}
                >
                  {h}
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {servico && profissional && q.data && q.hora && (
        <section style={{ display: "grid", gap: 8 }}>
          <h2 style={h2}>5. Seus dados</h2>
          <p style={{ margin: 0, color: "#444", fontSize: 14 }}>
            {servico.nome} com {profissional.nome} em {`${q.data.slice(8)}/${q.data.slice(5, 7)}`} às {q.hora}.
          </p>
          <BookingForm
            slug={slug}
            servicoId={servico.id}
            profissionalId={profissional.id}
            data={q.data}
            hora={q.hora}
          />
        </section>
      )}
    </main>
  );
}

const h2: React.CSSProperties = { fontSize: 15, margin: 0, color: "#333" };
const chip: React.CSSProperties = {
  padding: "0.5rem 0.8rem",
  border: "1px solid #ccc",
  borderRadius: 999,
  textDecoration: "none",
  color: "#222",
  fontSize: 14,
  background: "#fff",
};
const chipAtivo: React.CSSProperties = { ...chip, background: "#111", color: "#fff", borderColor: "#111" };
