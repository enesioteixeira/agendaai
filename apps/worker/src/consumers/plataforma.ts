// Jobs de PLATAFORMA — as únicas leituras cross-tenant do worker (allowlist
// do prismaSemTenant: doc 01 §5.2, doc 02 §15.2, doc 09 §3.2). Cada função
// aqui tem justificativa; mutação de dado de tenant NUNCA acontece neste
// arquivo — quem muta são os fluxos por tenant, sob runWithTenant.

import { prismaSemTenant } from "@atende/db/unsafe";

export interface CanalBaileysAtivo {
  id: string;
  empresaId: string;
  nome: string;
  statusConexao: string;
}

// Justificativa: o gestor de sockets precisa enumerar canais Baileys de TODOS
// os tenants para reconciliar o Map<canalId, socket> — leitura de metadados de
// conexão (nunca conteúdo de conversa).
export async function listarCanaisBaileys(): Promise<CanalBaileysAtivo[]> {
  return prismaSemTenant.canal.findMany({
    where: { tipo: "whatsapp_baileys", ativo: true },
    select: { id: true, empresaId: true, nome: true, statusConexao: true },
  });
}

export interface MensagemPendente {
  id: string;
  empresaId: string;
  canalId: string;
  conversaId: string;
  texto: string | null;
}

// Justificativa: o poller de outbox descobre saídas pendentes de todos os
// tenants — SÓ ids/rota (o claim e o envio rodam por tenant, sob
// runWithTenant, em consumers/outbox-envio.ts).
export async function listarMensagensPendentesBaileys(): Promise<MensagemPendente[]> {
  return prismaSemTenant.mensagem.findMany({
    where: {
      direcao: "saida",
      statusEntrega: "pendente",
      canal: { tipo: "whatsapp_baileys" },
    },
    select: { id: true, empresaId: true, canalId: true, conversaId: true, texto: true },
    orderBy: { criadoEm: "asc" },
    take: 50,
  });
}
