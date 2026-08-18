// E2E das filas e do ciclo de vida da conversa (E1) contra Postgres real.
//
// Os quatro casos aqui são os que já quebrariam a operação de um distribuidor se
// regredissem em silêncio:
//   1. carteira — o cliente com vendedor cai NO vendedor, não no rodízio;
//   2. primeira resposta — reentrega de webhook não pode reescrever o instante
//      que o SLA usa;
//   3. encerramento — sem motivo (e sem motivo DESTE tenant) não encerra, senão a
//      inbox nunca vira relatório de demanda;
//   4. isolamento — a regra inviolável 1 provada por model novo (doc 04 §2.8):
//      fila, membro e conversa de um tenant são invisíveis ao outro.

import { describe, it, expect, beforeAll } from "vitest";

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

const MINUTO = 60_000;

interface Cenario {
  empresaId: string;
  vendedorId: string;
  colegaId: string;
  canalId: string;
  clienteId: string;
  conversaId: string;
  filaId: string;
  motivoId: string;
}

/**
 * Distribuidor com uma fila de televendas por CARTEIRA, dois atendentes e uma
 * conversa entrando de um cliente que tem vendedor dono.
 */
async function montarCenario(sufixo: string): Promise<Cenario> {
  const { prisma } = await import("../client");
  const { runWithTenant } = await import("../tenancy");
  const { prismaSemTenant } = await import("../unsafe");
  const { criarFila, definirMembrosDaFila } = await import("./filas");

  const empresa = await prismaSemTenant.empresa.create({
    data: { slug: `filas-${sufixo}`, nome: `Filas ${sufixo}`, vertical: "distribuidor_alimentos" },
  });
  const papel = await prismaSemTenant.papel.create({
    data: { empresaId: empresa.id, nome: "Atendente" },
  });
  const vendedor = await prismaSemTenant.usuario.create({
    data: { email: `vendedor-${sufixo}@teste.local`, senhaHash: "x", nome: "Ana Vendedora" },
  });
  const colega = await prismaSemTenant.usuario.create({
    data: { email: `colega-${sufixo}@teste.local`, senhaHash: "x", nome: "Bruno Colega" },
  });
  await prismaSemTenant.vinculoUsuarioEmpresa.createMany({
    data: [
      { empresaId: empresa.id, usuarioId: vendedor.id, papelId: papel.id },
      { empresaId: empresa.id, usuarioId: colega.id, papelId: papel.id },
    ],
  });

  return runWithTenant({ empresaId: empresa.id }, async () => {
    const canal = await prisma.canal.create({
      data: { tipo: "whatsapp_baileys", nome: "WhatsApp Televendas" } as never,
    });
    const cliente = await prisma.cliente.create({
      data: {
        nome: "Mercado do Bairro",
        razaoSocial: "Mercado do Bairro LTDA",
        telefone: `+55119${sufixo.slice(-8).padStart(8, "0")}`,
        vendedorId: vendedor.id,
      } as never,
    });
    const identidade = await prisma.identidadeCanal.create({
      data: { clienteId: cliente.id, tipo: "whatsapp", valor: `id-${sufixo}` } as never,
    });
    const conversa = await prisma.conversa.create({
      data: {
        canalId: canal.id,
        clienteId: cliente.id,
        identidadeCanalId: identidade.id,
        estado: "fila_humano",
      } as never,
    });
    const motivo = await prisma.motivoEncerramento.create({
      data: { nome: "Pedido realizado" } as never,
    });

    const fila = await criarFila({
      nome: "Televendas",
      prazoPrimeiraRespostaMin: 15,
      distribuicao: "carteira",
      ordem: 1,
    });
    await definirMembrosDaFila(fila.id, [vendedor.id, colega.id]);

    return {
      empresaId: empresa.id,
      vendedorId: vendedor.id,
      colegaId: colega.id,
      canalId: canal.id,
      clienteId: cliente.id,
      conversaId: conversa.id,
      filaId: fila.id,
      motivoId: motivo.id,
    };
  });
}

describe.skipIf(!url)("E1 — filas e ciclo de vida da conversa (E2E)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = url;
  });

  it("roteia por carteira: o cliente com vendedor cai NO vendedor, com prazo gravado", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");
    const { rotearConversa } = await import("./filas");

    const c = await montarCenario(`cart-${Date.now()}`);
    const agora = new Date("2026-08-17T14:00:00.000Z");

    const resultado = await runWithTenant({ empresaId: c.empresaId }, () =>
      rotearConversa(c.conversaId, agora),
    );

    expect(resultado.filaId).toBe(c.filaId);
    expect(resultado.atendenteId).toBe(c.vendedorId);
    // Fila sem expediente configurado = 24 por 7: 15 min corridos.
    expect(resultado.prazo?.getTime()).toBe(agora.getTime() + 15 * MINUTO);

    // e o roteamento GRAVA — o painel lê da conversa, não do retorno da função
    const gravada = await runWithTenant({ empresaId: c.empresaId }, () =>
      prisma.conversa.findFirstOrThrow({ where: { id: c.conversaId } }),
    );
    expect(gravada.filaId).toBe(c.filaId);
    expect(gravada.atendenteUsuarioId).toBe(c.vendedorId);
    expect(gravada.prazoPrimeiraRespostaEm?.getTime()).toBe(agora.getTime() + 15 * MINUTO);

    // Rotear de novo NÃO reescreve o compromisso já assumido com o cliente.
    const outraVez = await runWithTenant({ empresaId: c.empresaId }, () =>
      rotearConversa(c.conversaId, new Date(agora.getTime() + 60 * MINUTO)),
    );
    expect(outraVez.prazo?.getTime()).toBe(agora.getTime() + 15 * MINUTO);
  });

  it("primeira resposta é idempotente e não retrocede — recibo atrasado não reescreve o SLA", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");
    const { registrarPrimeiraResposta } = await import("./filas");

    const c = await montarCenario(`prim-${Date.now()}`);
    const primeira = new Date("2026-08-17T14:05:00.000Z");
    const reentrega = new Date("2026-08-17T14:40:00.000Z");

    const a = await runWithTenant({ empresaId: c.empresaId }, () =>
      registrarPrimeiraResposta(c.conversaId, primeira),
    );
    expect(a).toEqual({ gravou: true, primeiraRespostaEm: primeira });

    // reentrega do provedor / recibo atrasado
    const b = await runWithTenant({ empresaId: c.empresaId }, () =>
      registrarPrimeiraResposta(c.conversaId, reentrega),
    );
    expect(b.gravou).toBe(false);
    expect(b.primeiraRespostaEm.getTime()).toBe(primeira.getTime());

    // e nem uma mensagem ANTERIOR pode puxar o instante para trás por outro
    // caminho: o campo só é escrito quando está nulo.
    const c2 = await runWithTenant({ empresaId: c.empresaId }, () =>
      registrarPrimeiraResposta(c.conversaId, new Date(primeira.getTime() - 10 * MINUTO)),
    );
    expect(c2.gravou).toBe(false);

    const gravada = await runWithTenant({ empresaId: c.empresaId }, () =>
      prisma.conversa.findFirstOrThrow({ where: { id: c.conversaId } }),
    );
    expect(gravada.primeiraRespostaEm?.getTime()).toBe(primeira.getTime());
  });

  it("encerrar EXIGE motivo — inexistente e de outro tenant são recusados com mensagem clara", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");
    const { encerrarConversa } = await import("./filas");

    const s = Date.now();
    const a = await montarCenario(`enc-a-${s}`);
    const b = await montarCenario(`enc-b-${s}`);

    await expect(
      runWithTenant({ empresaId: a.empresaId }, () =>
        encerrarConversa(a.conversaId, "motivo-que-nao-existe"),
      ),
    ).rejects.toThrow(/motivo de encerramento inválido/i);

    // o motivo do OUTRO tenant existe no banco — e mesmo assim não serve
    await expect(
      runWithTenant({ empresaId: a.empresaId }, () =>
        encerrarConversa(a.conversaId, b.motivoId),
      ),
    ).rejects.toThrow(/motivo de encerramento inválido/i);

    const emAberto = await runWithTenant({ empresaId: a.empresaId }, () =>
      prisma.conversa.findFirstOrThrow({ where: { id: a.conversaId } }),
    );
    expect(emAberto.encerradaEm).toBeNull();
    expect(emAberto.estado).not.toBe("encerrada");

    const quando = new Date("2026-08-17T18:00:00.000Z");
    await runWithTenant({ empresaId: a.empresaId }, () =>
      encerrarConversa(a.conversaId, a.motivoId, quando),
    );
    const encerrada = await runWithTenant({ empresaId: a.empresaId }, () =>
      prisma.conversa.findFirstOrThrow({ where: { id: a.conversaId } }),
    );
    expect(encerrada.estado).toBe("encerrada");
    expect(encerrada.motivoEncerramentoId).toBe(a.motivoId);
    expect(encerrada.encerradaEm?.getTime()).toBe(quando.getTime());

    // reencerrar não reescreve o instante que o relatório usa
    await expect(
      runWithTenant({ empresaId: a.empresaId }, () =>
        encerrarConversa(a.conversaId, a.motivoId, new Date(quando.getTime() + 60 * MINUTO)),
      ),
    ).rejects.toThrow(/já encerrada/i);
  });

  it("isolamento: fila, membro, inbox e roteamento de um tenant não existem para o outro", async () => {
    const { runWithTenant } = await import("../tenancy");
    const { listarFilas, listarInbox, rotearConversa, assumirConversa, definirMembrosDaFila } =
      await import("./filas");

    const s = Date.now();
    const a = await montarCenario(`iso-a-${s}`);
    const b = await montarCenario(`iso-b-${s}`);

    await runWithTenant({ empresaId: a.empresaId }, () => rotearConversa(a.conversaId, new Date()));

    const filasDeB = await runWithTenant({ empresaId: b.empresaId }, () => listarFilas());
    expect(filasDeB.map((f) => f.id)).not.toContain(a.filaId);
    expect(filasDeB).toHaveLength(1);
    expect(filasDeB[0]?.membros.map((m) => m.usuarioId).sort()).toEqual(
      [b.vendedorId, b.colegaId].sort(),
    );

    const inboxDeB = await runWithTenant({ empresaId: b.empresaId }, () => listarInbox());
    expect(inboxDeB.map((i) => i.conversaId)).not.toContain(a.conversaId);
    expect(inboxDeB.every((i) => i.conversaId === b.conversaId)).toBe(true);

    // conversa do tenant A é inexistente para B — e não "existente sem permissão"
    await expect(
      runWithTenant({ empresaId: b.empresaId }, () => rotearConversa(a.conversaId, new Date())),
    ).rejects.toThrow(/não encontrada/i);
    await expect(
      runWithTenant({ empresaId: b.empresaId }, () => assumirConversa(a.conversaId, b.vendedorId)),
    ).rejects.toThrow(/não encontrada/i);

    // e usuário do tenant A não entra na fila do tenant B
    await expect(
      runWithTenant({ empresaId: b.empresaId }, () =>
        definirMembrosDaFila(b.filaId, [a.vendedorId]),
      ),
    ).rejects.toThrow(/vínculo ativo/i);
  });

  it("inbox: última mensagem, não lidas e situação do prazo, com o mais apertado primeiro", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");
    const { rotearConversa, listarInbox, assumirConversa, devolverParaFila } = await import(
      "./filas"
    );

    const c = await montarCenario(`inbox-${Date.now()}`);
    const entrada = new Date("2026-08-17T14:00:00.000Z");

    await runWithTenant({ empresaId: c.empresaId }, async () => {
      await rotearConversa(c.conversaId, entrada);
      await prisma.mensagem.create({
        data: {
          canalId: c.canalId,
          conversaId: c.conversaId,
          direcao: "entrada",
          origemMotor: "cliente",
          texto: "Bom dia, quero repor o pedido",
          criadoEm: entrada,
        } as never,
      });
      await prisma.mensagem.create({
        data: {
          canalId: c.canalId,
          conversaId: c.conversaId,
          direcao: "entrada",
          origemMotor: "cliente",
          texto: "Consegue entregar amanhã?",
          criadoEm: new Date(entrada.getTime() + MINUTO),
        } as never,
      });
    });

    // 20 min depois o prazo de 15 min já estourou e ninguém respondeu
    const agora = new Date(entrada.getTime() + 20 * MINUTO);
    const inbox = await runWithTenant({ empresaId: c.empresaId }, () => listarInbox({ agora }));
    const item = inbox.find((i) => i.conversaId === c.conversaId);
    expect(item).toBeDefined();
    expect(item?.cliente.nome).toBe("Mercado do Bairro");
    expect(item?.canal.id).toBe(c.canalId);
    expect(item?.fila?.id).toBe(c.filaId);
    expect(item?.atendente?.id).toBe(c.vendedorId);
    expect(item?.ultimaMensagem?.texto).toBe("Consegue entregar amanhã?");
    expect(item?.naoLidas).toBe(2);
    expect(item?.situacaoPrazo).toBe("estourado");

    // o filtro de prazo devolve a mesma conversa; o de situação diferente, não
    const estourados = await runWithTenant({ empresaId: c.empresaId }, () =>
      listarInbox({ agora, situacaoPrazo: "estourado" }),
    );
    expect(estourados.map((i) => i.conversaId)).toContain(c.conversaId);
    const noPrazo = await runWithTenant({ empresaId: c.empresaId }, () =>
      listarInbox({ agora, situacaoPrazo: "no_prazo" }),
    );
    expect(noPrazo.map((i) => i.conversaId)).not.toContain(c.conversaId);

    // devolver para a fila solta o dono e mantém o prazo; assumir de volta funciona
    await runWithTenant({ empresaId: c.empresaId }, () => devolverParaFila(c.conversaId));
    const semDono = await runWithTenant({ empresaId: c.empresaId }, () =>
      listarInbox({ agora, atendenteUsuarioId: null }),
    );
    expect(semDono.map((i) => i.conversaId)).toContain(c.conversaId);
    expect(semDono.find((i) => i.conversaId === c.conversaId)?.prazoPrimeiraRespostaEm?.getTime()).toBe(
      entrada.getTime() + 15 * MINUTO,
    );

    await runWithTenant({ empresaId: c.empresaId }, () =>
      assumirConversa(c.conversaId, c.colegaId),
    );
    await expect(
      runWithTenant({ empresaId: c.empresaId }, () =>
        assumirConversa(c.conversaId, c.vendedorId),
      ),
    ).rejects.toThrow(/outro atendente/i);
  });
});
