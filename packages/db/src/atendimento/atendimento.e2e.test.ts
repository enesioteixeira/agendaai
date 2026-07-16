// E2E do schema do Bloco 3 (atendimento + clientes completo) contra Postgres
// real: isolamento de tenant da cadeia canal→conversa→mensagem e do pivô
// IdentidadeCanal; dedup de webhook por @@unique([empresaId, canalId,
// idExterno]) — a regra do gate do MVP exige um caso de isolamento por model
// novo (doc 04 §2.8).

import { describe, it, expect, beforeAll } from "vitest";

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

async function montarCadeiaAtendimento(sufixo: string) {
  const { prisma } = await import("../client");
  const { runWithTenant } = await import("../tenancy");
  const { prismaSemTenant } = await import("../unsafe");

  const empresa = await prismaSemTenant.empresa.create({
    data: { slug: `atend-teste-${sufixo}`, nome: `Atend ${sufixo}`, vertical: "salao" },
  });
  return runWithTenant({ empresaId: empresa.id }, async () => {
    const canal = await prisma.canal.create({
      data: { tipo: "whatsapp_baileys", nome: "WhatsApp Principal" } as never,
    });
    const cliente = await prisma.cliente.create({
      data: { nome: "Cliente Atend", telefone: "+5511900001111", provisorio: true } as never,
    });
    const identidade = await prisma.identidadeCanal.create({
      data: { clienteId: cliente.id, tipo: "whatsapp", valor: "+5511900001111" } as never,
    });
    const conversa = await prisma.conversa.create({
      data: {
        canalId: canal.id,
        clienteId: cliente.id,
        identidadeCanalId: identidade.id,
        estado: "fila_humano",
      } as never,
    });
    return { empresa, canal, cliente, identidade, conversa };
  });
}

describe.skipIf(!url)("Bloco 3.1 — atendimento E2E", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = url;
  });

  it("cadeia canal→conversa→mensagem + identidade + tags invisíveis a outro tenant", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");
    const { prismaSemTenant } = await import("../unsafe");

    const s = Date.now();
    const a = await montarCadeiaAtendimento(`a-${s}`);
    const b = await prismaSemTenant.empresa.create({
      data: { slug: `atend-teste-b-${s}`, nome: "Atend B", vertical: "barbearia" },
    });

    await runWithTenant({ empresaId: a.empresa.id }, async () => {
      await prisma.mensagem.create({
        data: {
          canalId: a.canal.id,
          conversaId: a.conversa.id,
          direcao: "entrada",
          origemMotor: "cliente",
          texto: "Oi, quero agendar",
          idExterno: `wamid-${s}`,
        } as never,
      });
      const tag = await prisma.tag.create({ data: { nome: "VIP" } as never });
      await prisma.tagCliente.create({
        data: { tagId: tag.id, clienteId: a.cliente.id } as never,
      });
      await prisma.notaCliente.create({
        data: { clienteId: a.cliente.id, texto: "Prefere manhã" } as never,
      });
      await prisma.authStateBaileys.create({
        data: { canalId: a.canal.id, chave: "creds", valorCifrado: "enc:x:y:z" } as never,
      });
    });

    const vistosPorB = await runWithTenant({ empresaId: b.id }, async () => ({
      canais: await prisma.canal.findMany(),
      conversas: await prisma.conversa.findMany(),
      mensagens: await prisma.mensagem.findMany(),
      identidades: await prisma.identidadeCanal.findMany(),
      tags: await prisma.tag.findMany(),
      tagsCliente: await prisma.tagCliente.findMany(),
      notas: await prisma.notaCliente.findMany(),
      auth: await prisma.authStateBaileys.findMany(),
    }));
    for (const [nome, lista] of Object.entries(vistosPorB)) {
      expect(lista, `tenant B não pode ver ${nome} do tenant A`).toHaveLength(0);
    }
  });

  it("dedup de webhook: mesmo idExterno no mesmo canal morre no unique; canais distintos coexistem", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");

    const s = Date.now();
    const t = await montarCadeiaAtendimento(`dedup-${s}`);

    await runWithTenant({ empresaId: t.empresa.id }, async () => {
      const base = {
        canalId: t.canal.id,
        conversaId: t.conversa.id,
        direcao: "entrada",
        origemMotor: "cliente",
        texto: "primeira entrega",
        idExterno: "wamid-dedup-1",
      };
      await prisma.mensagem.create({ data: base as never });
      // reentrega do provedor → unique 23505
      await expect(prisma.mensagem.create({ data: base as never })).rejects.toThrow(
        /unique|23505/i,
      );
      // mensagens SEM idExterno (sistema) não participam do unique
      await prisma.mensagem.create({
        data: { ...base, idExterno: null, origemMotor: "sistema", texto: "s1" } as never,
      });
      await prisma.mensagem.create({
        data: { ...base, idExterno: null, origemMotor: "sistema", texto: "s2" } as never,
      });
      const total = await prisma.mensagem.count({ where: { conversaId: t.conversa.id } });
      expect(total).toBe(3);
    });
  });

  it("identidade única por (tipo, valor) POR TENANT — a mesma pessoa existe em dois tenants", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");

    const s = Date.now();
    const t1 = await montarCadeiaAtendimento(`id1-${s}`);
    const t2 = await montarCadeiaAtendimento(`id2-${s}`);

    // no MESMO tenant, repetir (whatsapp, valor) é violação de unique
    await expect(
      runWithTenant({ empresaId: t1.empresa.id }, () =>
        prisma.identidadeCanal.create({
          data: {
            clienteId: t1.cliente.id,
            tipo: "whatsapp",
            valor: "+5511900001111",
          } as never,
        }),
      ),
    ).rejects.toThrow(/unique|23505/i);

    // em tenants DIFERENTES, o mesmo telefone coexiste (cada um é controlador)
    const deT2 = await runWithTenant({ empresaId: t2.empresa.id }, () =>
      prisma.identidadeCanal.findMany({ where: { valor: "+5511900001111" } }),
    );
    expect(deT2).toHaveLength(1);
    expect(deT2[0]?.empresaId).toBe(t2.empresa.id);
  });
});
