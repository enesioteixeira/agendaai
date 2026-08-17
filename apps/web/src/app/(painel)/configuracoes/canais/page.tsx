import { redirect } from "next/navigation";

import { temEscopo, crypto as cryptoCore } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { Badge, EstadoVazio } from "@atende/ui";

import { AutoRefresh } from "@/modules/atendimento/AutoRefresh";
import { CanalForm } from "@/modules/atendimento/CanalForm";
import { canalDefinirAgenteAction, canalRemoverAction } from "@/modules/atendimento/actions";
import { lerSessao } from "@/lib/sessao";

const { decifrarSegredo } = cryptoCore;

const STATUS: Record<
  string,
  { readonly rotulo: string; readonly tom: "sucesso" | "atencao" | "perigo" | "neutro" }
> = {
  conectado: { rotulo: "Conectado", tom: "sucesso" },
  pareando: { rotulo: "Escaneie o QR", tom: "atencao" },
  desconectado: { rotulo: "Aguardando o worker", tom: "neutro" },
  erro: { rotulo: "Erro de conexão", tom: "perigo" },
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
      <div className="p-4 md:p-6">
        <EstadoVazio
          icone="escudo"
          titulo="Sem acesso a canais"
          descricao="Seu papel não configura canais. Peça a um administrador o escopo config:canais."
        />
      </div>
    );
  }

  const { canais, agentes } = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    async () => ({
      canais: await prisma.canal.findMany({ where: { ativo: true }, orderBy: { criadoEm: "asc" } }),
      // Só agentes com versão PUBLICADA podem atender: oferecer um rascunho na
      // lista faria o usuário escolher algo que nunca responderia.
      agentes: await prisma.agenteIA.findMany({
        where: { ativo: true, deletedAt: null, NOT: { versaoAtivaId: null } },
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
      }),
    }),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      {/* Polling curto: o QR troca a cada ~20 s e o status muda no instante do
          scan — sem isso o usuário fica olhando um QR já vencido. */}
      <AutoRefresh intervaloMs={3000} />

      <header>
        <h1 className="text-[19px] font-semibold tracking-tight">Canais de atendimento</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-texto-suave">
          Conecte o WhatsApp do seu negócio escaneando o QR (WhatsApp → Aparelhos conectados).
          Este canal <strong className="font-semibold text-texto">responde</strong> conversas
          iniciadas pelo cliente — disparo em massa não existe aqui, e é de propósito: é o que
          mantém o número fora do risco de bloqueio.
        </p>
      </header>

      <CanalForm />

      {canais.length === 0 ? (
        <EstadoVazio
          icone="antena"
          titulo="Nenhum canal conectado"
          descricao="Adicione o primeiro acima e deixe o worker rodando para o QR aparecer."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {canais.map((c) => {
            let qrDataUrl: string | null = null;
            if (c.statusConexao === "pareando" && c.configCifrada) {
              try {
                qrDataUrl =
                  (JSON.parse(decifrarSegredo(c.configCifrada)) as { qrDataUrl?: string })
                    .qrDataUrl ?? null;
              } catch {
                qrDataUrl = null;
              }
            }
            const st = STATUS[c.statusConexao] ?? { rotulo: c.statusConexao, tom: "neutro" as const };

            return (
              <li
                key={c.id}
                className="flex flex-col gap-3 rounded-2 border border-borda bg-superficie p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{c.nome}</p>
                    <p className="text-[11px] text-texto-fraco">
                      {c.tipo === "whatsapp_baileys" ? "WhatsApp (QR)" : c.tipo}
                    </p>
                  </div>
                  <Badge tom={st.tom}>{st.rotulo}</Badge>
                  <form action={canalRemoverAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="ie-botao">
                      Remover
                    </button>
                  </form>
                </div>

                {qrDataUrl ? (
                  <div className="flex flex-col items-center gap-2 border-t border-borda pt-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrDataUrl}
                      alt="QR de pareamento do WhatsApp"
                      width={220}
                      height={220}
                      // Largura fluida: 220px fixos estouravam o viewport do
                      // celular — que é justamente onde o QR é lido.
                      className="rounded-2 border border-borda"
                      style={{ width: "min(220px, 60vw)", height: "auto" }}
                    />
                    <p className="text-center text-[11px] text-texto-fraco">
                      WhatsApp → Aparelhos conectados → Conectar aparelho
                    </p>
                  </div>
                ) : null}

                <form
                  action={canalDefinirAgenteAction}
                  className="flex flex-wrap items-center gap-2 border-t border-borda pt-3"
                >
                  <input type="hidden" name="canalId" value={c.id} />
                  <label className="flex flex-1 flex-col gap-1 text-[12px] text-texto-suave">
                    Quem atende primeiro
                    <select
                      name="agenteId"
                      defaultValue={c.agentePadraoId ?? ""}
                      className="rounded-2 border border-borda bg-superficie px-2 py-1.5 text-[13px] text-texto outline-none focus:border-acento"
                    >
                      <option value="">Ninguém — só humanos</option>
                      {agentes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="ie-botao self-end">
                    Salvar
                  </button>
                  {agentes.length === 0 ? (
                    <p className="w-full text-[11px] text-texto-fraco">
                      Nenhum agente publicado ainda —{" "}
                      <a href="/agentes" className="text-acento underline">
                        crie e publique um
                      </a>{" "}
                      para ele atender aqui.
                    </p>
                  ) : null}
                </form>

                {c.statusConexao === "desconectado" ? (
                  <p className="border-t border-borda pt-3 text-[11px] leading-relaxed text-texto-fraco">
                    O QR aparece quando o worker está rodando. Se ele estiver parado, o canal
                    fica assim e nenhuma mensagem entra ou sai.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
