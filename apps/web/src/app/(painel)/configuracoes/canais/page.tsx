import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import { temEscopo, crypto as cryptoCore } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { AutoRefresh } from "@/modules/atendimento/AutoRefresh";
import { CanalForm } from "@/modules/atendimento/CanalForm";
import { canalRemoverAction } from "@/modules/atendimento/actions";
import { tb, th, td, btSec } from "@/modules/agenda/estilos";

const { decifrarSegredo } = cryptoCore;

const STATUS_ROTULO: Record<string, string> = {
  desconectado: "Desconectado — aguardando o worker",
  pareando: "Pareando — escaneie o QR abaixo",
  conectado: "✓ Conectado",
  erro: "Erro de conexão",
};

// Canais WhatsApp (config:canais). O pareamento é via QR: o worker (rodando
// na máquina local — doc 11) abre o socket, publica o QR cifrado no Canal e o
// painel exibe; escaneou → conectado. AVISO explícito: canal Baileys SÓ
// responde conversas iniciadas pelo cliente (regra inviolável 12).
export default async function CanaisPage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  if (!temEscopo(sessao, "config:canais")) {
    return (
      <div>
        <h1 style={{ fontSize: 22 }}>Canais</h1>
        <p style={{ color: "#c0362c" }}>Seu papel não configura canais (escopo config:canais).</p>
      </div>
    );
  }

  const canais = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    () => prisma.canal.findMany({ where: { ativo: true }, orderBy: { criadoEm: "asc" } }),
  );

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 760 }}>
      <AutoRefresh intervaloMs={3000} />
      <div>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Canais de atendimento</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Conecte o WhatsApp do seu negócio escaneando o QR (WhatsApp → Aparelhos conectados).
          Este canal <strong>responde</strong> conversas iniciadas pelos clientes — envios em massa/proativos não existem aqui.
        </p>
      </div>

      <CanalForm />

      <table style={tb}>
        <thead>
          <tr>
            <th style={th}>Canal</th>
            <th style={th}>Tipo</th>
            <th style={th}>Status</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {canais.length === 0 && (
            <tr><td style={td} colSpan={4}>Nenhum canal — adicione o primeiro acima e deixe o worker rodando.</td></tr>
          )}
          {canais.map((c) => {
            let qrDataUrl: string | null = null;
            if (c.statusConexao === "pareando" && c.configCifrada) {
              try {
                qrDataUrl = (JSON.parse(decifrarSegredo(c.configCifrada)) as { qrDataUrl?: string }).qrDataUrl ?? null;
              } catch {
                qrDataUrl = null;
              }
            }
            return (
              <tr key={c.id}>
                <td style={td}>{c.nome}</td>
                <td style={td}>{c.tipo === "whatsapp_baileys" ? "WhatsApp (QR)" : c.tipo}</td>
                <td style={td}>
                  {STATUS_ROTULO[c.statusConexao] ?? c.statusConexao}
                  {qrDataUrl && (
                    <div style={{ marginTop: 8 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrDataUrl} alt="QR de pareamento do WhatsApp" width={220} height={220} style={{ border: "1px solid #ddd", borderRadius: 8 }} />
                    </div>
                  )}
                </td>
                <td style={td}>
                  <form action={canalRemoverAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" style={{ ...btSec, padding: "0.25rem 0.6rem", fontSize: 13 }}>
                      Remover
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ color: "#999", fontSize: 13, margin: 0 }}>
        O pareamento exige o <strong>worker rodando</strong> (por ora na máquina do administrador:
        <code style={{ margin: "0 4px" }}>pnpm --filter @atende/worker dev</code> com DATABASE_URL e ENCRYPTION_KEY).
        Status atualiza sozinho a cada 3s.
      </p>
    </div>
  );
}
