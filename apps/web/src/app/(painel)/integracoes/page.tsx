import { redirect } from "next/navigation";

import { temEscopo } from "@atende/core";
import { prisma, runWithTenant } from "@atende/db";
import { Badge, EstadoVazio, formatarDataHora } from "@atende/ui";

import { FormConectar } from "@/modules/integracoes/FormIntegracao";
import {
  pausarIntegracaoAction,
  removerIntegracaoAction,
} from "@/modules/integracoes/actions";
import { lerSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

const CATEGORIA = { erp: "ERP", crm: "CRM", pagamento: "Pagamento", ia: "IA" } as const;
const TOM = { conectada: "sucesso", erro: "perigo", pausada: "atencao" } as const;

export default async function IntegracoesPage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  if (!temEscopo(sessao, "config:empresa")) {
    return (
      <div className="p-6">
        <EstadoVazio
          icone="escudo"
          titulo="Sem acesso"
          descricao="Seu papel não configura integrações. Peça a um administrador o escopo config:empresa."
        />
      </div>
    );
  }

  const integracoes = await runWithTenant(
    { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId },
    () =>
      prisma.integracaoExterna.findMany({
        // A credencial de IA aparece em /agentes, junto do agente que a usa —
        // listá-la aqui como "integração" faria o usuário procurar a chave do
        // modelo em dois lugares.
        where: { categoria: { not: "ia" } },
        orderBy: { criadoEm: "asc" },
        // A credencial cifrada NÃO entra no select: o que não é lido não vaza
        // por acidente num log ou num erro serializado.
        select: {
          id: true,
          categoria: true,
          tipo: true,
          nome: true,
          status: true,
          ultimoErro: true,
          ultimaSincronizacao: true,
          criadoEm: true,
        },
      }),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      <header>
        <h1 className="text-[19px] font-semibold tracking-tight">Integrações</h1>
        <p className="mt-1 text-[13px] text-texto-suave">
          Conecte o ERP ou o CRM que sua empresa já usa. Com um ERP ligado, o atendimento consulta
          produtos e preços reais, cria pedidos e gera cobrança sem sair da conversa.
        </p>
      </header>

      {integracoes.length === 0 ? (
        <EstadoVazio
          icone="plugue"
          titulo="Nenhuma integração conectada"
          descricao="Conecte a primeira abaixo. A chave fica cifrada e nunca volta a aparecer na tela."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {integracoes.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center gap-3 rounded-2 border border-borda bg-superficie px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{i.nome}</p>
                <p className="text-[11px] text-texto-fraco">
                  {CATEGORIA[i.categoria]} · {i.tipo} · conectada em{" "}
                  {formatarDataHora(i.criadoEm)}
                  {i.ultimaSincronizacao
                    ? ` · última sync ${formatarDataHora(i.ultimaSincronizacao)}`
                    : ""}
                </p>
                {i.ultimoErro ? (
                  <p className="mt-1 text-[11px] text-perigo">{i.ultimoErro}</p>
                ) : null}
              </div>

              <Badge tom={TOM[i.status]}>{i.status}</Badge>

              <form action={pausarIntegracaoAction}>
                <input type="hidden" name="id" value={i.id} />
                <input type="hidden" name="pausar" value={i.status === "pausada" ? "0" : "1"} />
                <button type="submit" className="ie-botao">
                  {i.status === "pausada" ? "Retomar" : "Pausar"}
                </button>
              </form>

              <form action={removerIntegracaoAction}>
                <input type="hidden" name="id" value={i.id} />
                <button type="submit" className="ie-botao ie-botao--perigo">
                  Remover
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-texto-fraco">
          Conectar sistema
        </h2>
        <FormConectar />
      </section>

      <p className="rounded-2 border border-borda bg-superficie-2 p-3 text-[12px] leading-relaxed text-texto-suave">
        <strong className="font-semibold text-texto">Em construção:</strong> a conexão já é gravada
        e a credencial fica cifrada, mas a sincronização automática (buscar produtos, criar pedido,
        gerar Pix) ainda não roda — falta ligar o worker de sincronização. O Mensvra ERP também
        ainda não expõe a API deste contrato; o driver está pronto e testado contra um sandbox.
      </p>
    </div>
  );
}
