import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { temEscopo } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { AutoRefresh } from "@/modules/atendimento/AutoRefresh";
import { assumirConversaAction } from "@/modules/atendimento/actions";
import { tb, th, td, btSec } from "@/modules/agenda/estilos";

const ESTADO_ROTULO: Record<string, string> = {
  fila_humano: "Na fila",
  humano: "Em atendimento",
  bot_arvore: "Bot (árvore)",
  bot_ia: "Bot (IA)",
  encerrada: "Encerrada",
};

// Inbox do atendimento (Bloco 3.4): fila + minhas + todas, com polling 5s
// (SSE quando o worker tiver host público — doc 11).
export default async function AtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");
  const { filtro = "abertas" } = await searchParams;

  if (!temEscopo(sessao, "atendimento:responder")) {
    return (
      <div>
        <h1 style={{ fontSize: 22 }}>Atendimento</h1>
        <p style={{ color: "#c0362c" }}>Seu papel não atende conversas (escopo atendimento:responder).</p>
      </div>
    );
  }

  const conversas = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    () =>
      prisma.conversa.findMany({
        where: {
          deletedAt: null,
          ...(filtro === "fila"
            ? { estado: "fila_humano" as const }
            : filtro === "minhas"
              ? { estado: "humano" as const, atendenteUsuarioId: sessao.usuarioId }
              : filtro === "encerradas"
                ? { estado: "encerrada" as const }
                : { estado: { not: "encerrada" as const } }),
        },
        orderBy: { atualizadoEm: "desc" },
        take: 100,
        include: {
          cliente: true,
          canal: true,
          atendente: true,
          mensagens: { orderBy: { criadoEm: "desc" }, take: 1 },
        },
      }),
  );

  const abas = [
    { chave: "abertas", rotulo: "Abertas" },
    { chave: "fila", rotulo: "Na fila" },
    { chave: "minhas", rotulo: "Minhas" },
    { chave: "encerradas", rotulo: "Encerradas" },
  ];

  return (
    <div style={{ display: "grid", gap: "1.25rem", maxWidth: 950 }}>
      <AutoRefresh />
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Atendimento</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Conversas do WhatsApp em tempo quase-real (atualiza a cada 5s). Configure canais em{" "}
          <a href="/configuracoes/canais">Configurações → Canais</a>.
        </p>
      </div>

      <nav style={{ display: "flex", gap: 4 }}>
        {abas.map((a) => (
          <a
            key={a.chave}
            href={`/atendimento?filtro=${a.chave}`}
            style={{
              padding: "0.35rem 0.7rem",
              borderRadius: 6,
              fontSize: 14,
              textDecoration: "none",
              background: filtro === a.chave ? "#111" : "#f2f2f2",
              color: filtro === a.chave ? "#fff" : "#333",
            }}
          >
            {a.rotulo}
          </a>
        ))}
      </nav>

      <table style={tb}>
        <thead>
          <tr>
            <th style={th}>Cliente</th>
            <th style={th}>Última mensagem</th>
            <th style={th}>Canal</th>
            <th style={th}>Estado</th>
            <th style={th}>Atendente</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {conversas.length === 0 && (
            <tr><td style={td} colSpan={6}>Nenhuma conversa aqui. Assim que um cliente mandar mensagem no WhatsApp conectado, ela aparece.</td></tr>
          )}
          {conversas.map((c) => (
            <tr key={c.id}>
              <td style={td}>
                <a href={`/atendimento/${c.id}`} style={{ color: "#4f7cff" }}>
                  {c.cliente.nome}
                </a>
              </td>
              <td style={{ ...td, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.mensagens[0]?.texto ?? "—"}
              </td>
              <td style={td}>{c.canal.nome}</td>
              <td style={td}>{ESTADO_ROTULO[c.estado] ?? c.estado}</td>
              <td style={td}>{c.atendente?.nome ?? "—"}</td>
              <td style={td}>
                {c.estado === "fila_humano" && temEscopo(sessao, "atendimento:assumir") && (
                  <form action={assumirConversaAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" style={{ ...btSec, padding: "0.25rem 0.6rem", fontSize: 13 }}>
                      Assumir
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
