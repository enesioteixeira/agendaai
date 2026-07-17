import { redirect, notFound } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { temEscopo } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { AutoRefresh } from "@/modules/atendimento/AutoRefresh";
import { ResponderForm } from "@/modules/atendimento/ResponderForm";
import {
  assumirConversaAction,
  encerrarConversaAction,
} from "@/modules/atendimento/actions";
import { btSec } from "@/modules/agenda/estilos";

const STATUS_ICONE: Record<string, string> = {
  pendente: "🕓",
  enviada: "✓",
  entregue: "✓✓",
  lida: "✓✓",
  falhou: "⚠ falhou",
};

// Conversa individual: histórico (índice conversaId+criadoEm) + resposta.
export default async function ConversaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");
  const { id } = await params;

  if (!temEscopo(sessao, "atendimento:responder")) {
    return <p style={{ color: "#c0362c" }}>Seu papel não atende conversas.</p>;
  }

  const conversa = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    () =>
      prisma.conversa.findUnique({
        where: { id },
        include: {
          cliente: true,
          canal: true,
          atendente: true,
          mensagens: { orderBy: { criadoEm: "asc" }, take: 500 },
        },
      }),
  );
  if (!conversa || conversa.deletedAt) notFound();

  const aberta = conversa.estado !== "encerrada";

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
      <AutoRefresh />
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <a href="/atendimento" style={{ color: "#4f7cff", fontSize: 14 }}>← Voltar</a>
        <h1 style={{ fontSize: 20, margin: 0 }}>{conversa.cliente.nome}</h1>
        <span style={{ color: "#666", fontSize: 13 }}>
          {conversa.canal.nome} · {conversa.estado.replace("_", " ")}
          {conversa.atendente && ` · com ${conversa.atendente.nome}`}
        </span>
        {conversa.estado === "fila_humano" && temEscopo(sessao, "atendimento:assumir") && (
          <form action={assumirConversaAction}>
            <input type="hidden" name="id" value={conversa.id} />
            <button type="submit" style={{ ...btSec, padding: "0.25rem 0.6rem", fontSize: 13 }}>Assumir</button>
          </form>
        )}
        {aberta && (
          <form action={encerrarConversaAction}>
            <input type="hidden" name="id" value={conversa.id} />
            <button type="submit" style={{ ...btSec, padding: "0.25rem 0.6rem", fontSize: 13 }}>Encerrar</button>
          </form>
        )}
      </div>

      <div style={{ display: "grid", gap: 6, background: "#f7f6f3", borderRadius: 10, padding: "1rem", maxHeight: 480, overflowY: "auto" }}>
        {conversa.mensagens.length === 0 && (
          <p style={{ color: "#888", margin: 0, fontSize: 14 }}>Sem mensagens ainda.</p>
        )}
        {conversa.mensagens.map((m) => {
          const minha = m.direcao === "saida";
          return (
            <div
              key={m.id}
              style={{
                justifySelf: minha ? "end" : "start",
                maxWidth: "80%",
                background: minha ? "#dcf3d0" : "#fff",
                borderRadius: 10,
                padding: "0.45rem 0.7rem",
                fontSize: 14,
                boxShadow: "0 1px 1px rgba(0,0,0,0.08)",
              }}
            >
              <div>{m.texto ?? `[${m.tipo}]`}</div>
              <div style={{ fontSize: 11, color: "#888", textAlign: "right", marginTop: 2 }}>
                {m.criadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                {minha && ` ${STATUS_ICONE[m.statusEntrega] ?? ""}`}
              </div>
            </div>
          );
        })}
      </div>

      {aberta ? (
        <ResponderForm conversaId={conversa.id} />
      ) : (
        <p style={{ color: "#888", fontSize: 14, margin: 0 }}>Conversa encerrada.</p>
      )}
    </div>
  );
}
