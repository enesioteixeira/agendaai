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

export interface EnvioReservado {
  id: string;
  empresaId: string;
}

// Justificativa: o varredor de reservas órfãs precisa enxergar `enviando`
// parada em TODOS os tenants — de novo só ids/rota. A marcação como `falhou`
// não acontece aqui: ela roda por tenant, sob runWithTenant, e é condicional
// (o `updateMany` repete o filtro), então uma mensagem que terminou de sair
// entre a leitura e a escrita não é atropelada.
//
// `envioReservadoEm` nulo entra na lista de propósito: é linha anterior à
// migration que criou o carimbo, e presa em `enviando` ela seria invisível.
export async function listarEnviosExpirados(limite: Date): Promise<EnvioReservado[]> {
  return prismaSemTenant.mensagem.findMany({
    where: {
      direcao: "saida",
      statusEntrega: "enviando",
      OR: [{ envioReservadoEm: null }, { envioReservadoEm: { lt: limite } }],
    },
    select: { id: true, empresaId: true },
    orderBy: { criadoEm: "asc" },
    take: 50,
  });
}
