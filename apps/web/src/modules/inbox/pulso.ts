"use server";

import { prisma, runWithTenant } from "@atende/db";

import { lerSessao } from "@/lib/sessao";

/**
 * O "pulso" da inbox: uma assinatura barata do estado das conversas do tenant.
 *
 * POR QUE ISTO EXISTE, E NÃO SSE. O desenho pede SSE (doc 01, doc 12 §2.3), e
 * ele continua sendo o alvo — mas o hub vive no `apps/worker`, que ainda roda
 * local e não tem host público (doc 11, divergência 6). Servir o stream pelo
 * próprio Next não resolve: o Worker teria de consultar o banco dentro da
 * conexão aberta, e o plano gratuito do Cloudflare dá 10 ms de CPU por request.
 *
 * O QUE ISTO MELHORA. O polling anterior chamava `router.refresh()` a cada 5 s
 * cegamente: toda vez refazia as queries da lista, da conversa e do contato, e
 * re-renderizava as três colunas — mesmo com nada novo, que é o caso na esmagadora
 * maioria dos ticks. Agora o tick pergunta só "mudou?" com uma agregação sobre
 * `(empresaId, atualizadoEm)` e só paga o refresh quando a resposta muda.
 *
 * A assinatura combina o instante da última atualização COM a contagem: só o
 * instante perderia a conversa que sai da lista (encerrada, filtro trocado) sem
 * ninguém ter sido atualizado depois dela.
 */
export async function pulsoDaInbox(): Promise<string> {
  const sessao = await lerSessao();
  if (!sessao) return "sem-sessao";

  return runWithTenant({ empresaId: sessao.empresaId, usuarioId: sessao.usuarioId }, async () => {
    const [agregado, total] = await Promise.all([
      prisma.conversa.aggregate({
        where: { deletedAt: null },
        _max: { atualizadoEm: true },
      }),
      prisma.conversa.count({ where: { deletedAt: null } }),
    ]);
    const ultima = agregado._max.atualizadoEm?.getTime() ?? 0;
    return `${ultima}:${total}`;
  });
}
