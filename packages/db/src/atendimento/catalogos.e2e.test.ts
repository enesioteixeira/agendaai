// E2E dos catálogos do atendimento (E1) contra Postgres real. São quatro
// perguntas, e nenhuma delas se responde com mock:
//
// 1. o atalho normalizado colide de verdade no unique `(empresaId, atalho)`?
// 2. aplicar a mesma etiqueta duas vezes devolve sucesso em vez de 23505?
// 3. arquivar preserva o histórico — a conversa encerrada continua resolvendo
//    o nome do motivo depois de ele sair do menu?
// 4. o catálogo de um tenant é invisível (e inaplicável) do outro?
//
// A 2 e a 3 dependem do comportamento do banco (unique parcial, FK preservada),
// e a 4 é a prova da regra inviolável 1 nesta superfície — as três só valem
// contra banco.

import { describe, it, expect, beforeAll } from "vitest";

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

interface Cenario {
  empresaId: string;
  usuarioId: string;
  conversaId: string;
  filaId: string;
}

/** Tenant completo: empresa + membro ativo + fila + conversa aberta. */
async function montarCenario(sufixo: string): Promise<Cenario> {
  const { prisma } = await import("../client");
  const { runWithTenant } = await import("../tenancy");
  const { prismaSemTenant } = await import("../unsafe");

  const empresa = await prismaSemTenant.empresa.create({
    data: {
      slug: `catalogos-${sufixo}`,
      nome: `Catálogos ${sufixo}`,
      vertical: "distribuidor_alimentos",
    },
  });
  const usuario = await prismaSemTenant.usuario.create({
    data: {
      email: `atendente-${sufixo}@exemplo.test`,
      senhaHash: "nao-usado-neste-teste",
      nome: `Atendente ${sufixo}`,
    },
  });

  return runWithTenant({ empresaId: empresa.id }, async () => {
    const papel = await prisma.papel.create({ data: { nome: "Atendente" } as never });
    await prisma.vinculoUsuarioEmpresa.create({
      data: { usuarioId: usuario.id, papelId: papel.id } as never,
    });
    const fila = await prisma.fila.create({ data: { nome: "Televendas" } as never });
    const canal = await prisma.canal.create({
      data: { tipo: "whatsapp_baileys", nome: "WhatsApp" } as never,
    });
    const cliente = await prisma.cliente.create({
      data: { nome: `Cliente ${sufixo}`, telefone: `+55119${sufixo.slice(-8)}` } as never,
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
        filaId: fila.id,
      } as never,
    });
    return {
      empresaId: empresa.id,
      usuarioId: usuario.id,
      conversaId: conversa.id,
      filaId: fila.id,
    };
  });
}

describe.skipIf(!url)("E1 — catálogos do atendimento E2E", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = url;
  });

  it("atalho normalizado: '/Prazo', 'prazo ' e 'PRAZO' são a MESMA resposta rápida", async () => {
    const { runWithTenant } = await import("../tenancy");
    const { criarRespostaRapida, listarRespostasRapidas, normalizarAtalho } = await import(
      "./catalogos"
    );

    expect(normalizarAtalho("/Prazo")).toBe("prazo");
    expect(normalizarAtalho("  prazo ")).toBe("prazo");
    expect(normalizarAtalho("///PRAZO")).toBe("prazo");
    expect(normalizarAtalho("/Endereço de entrega")).toBe("enderecodeentrega");

    const c = await montarCenario(`atalho-${Date.now()}`);
    await runWithTenant({ empresaId: c.empresaId }, async () => {
      const criada = await criarRespostaRapida({
        atalho: "/Prazo ",
        titulo: "Prazo de entrega",
        texto: "Entregamos em até 48 horas úteis.",
      });
      expect(criada.atalho).toBe("prazo");

      // as outras grafias batem no unique (empresaId, atalho) e viram erro de
      // domínio — não um 23505 cru na cara de quem cadastra
      for (const grafia of ["prazo", " PRAZO", "/prazo"]) {
        await expect(
          criarRespostaRapida({ atalho: grafia, titulo: "Outro", texto: "Outro texto." }),
        ).rejects.toThrow(/Já existe uma resposta rápida/);
      }

      // atalho impossível de digitar no composer é recusado na borda (Zod)
      await expect(
        criarRespostaRapida({ atalho: "//", titulo: "Vazio", texto: "x" }),
      ).rejects.toThrow();

      expect(await listarRespostasRapidas()).toHaveLength(1);
    });
  });

  it("respostas da fila vêm junto com as gerais, e nunca as de outra fila", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");
    const { criarRespostaRapida, listarRespostasRapidas, arquivarRespostaRapida } = await import(
      "./catalogos"
    );

    const c = await montarCenario(`bolsos-${Date.now()}`);
    await runWithTenant({ empresaId: c.empresaId }, async () => {
      const outraFila = await prisma.fila.create({ data: { nome: "Financeiro" } as never });

      await criarRespostaRapida({
        atalho: "/geral",
        titulo: "Saudação",
        texto: "Olá! Como posso ajudar?",
      });
      await criarRespostaRapida({
        atalho: "/pedido",
        titulo: "Pedido",
        texto: "Já separei seu pedido.",
        filaId: c.filaId,
      });
      const daOutra = await criarRespostaRapida({
        atalho: "/boleto",
        titulo: "Boleto",
        texto: "Segue a segunda via.",
        filaId: outraFila.id,
      });

      const doAtendente = await listarRespostasRapidas(c.filaId);
      expect(doAtendente.map((r) => r.atalho)).toEqual(["pedido", "geral"]);
      expect(doAtendente.some((r) => r.id === daOutra.id)).toBe(false);

      // sem filaId é a tela de configuração: enxerga o catálogo inteiro
      expect(await listarRespostasRapidas()).toHaveLength(3);

      // arquivada some do composer mas o texto continua no banco
      await arquivarRespostaRapida(daOutra.id);
      expect(await listarRespostasRapidas(outraFila.id)).toHaveLength(1); // só a geral
      const comArquivadas = await listarRespostasRapidas(outraFila.id, {
        incluirArquivadas: true,
      });
      expect(comArquivadas.find((r) => r.id === daOutra.id)?.texto).toBe("Segue a segunda via.");
    });
  });

  it("aplicar etiqueta é idempotente: dois cliques, uma linha", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");
    const { criarEtiqueta, aplicarEtiqueta, removerEtiqueta } = await import("./catalogos");

    const c = await montarCenario(`idem-${Date.now()}`);
    await runWithTenant({ empresaId: c.empresaId }, async () => {
      const etiqueta = await criarEtiqueta({ nome: "Urgente", cor: "vermelho-500" });

      const primeira = await aplicarEtiqueta(c.conversaId, etiqueta.id);
      const segunda = await aplicarEtiqueta(c.conversaId, etiqueta.id);
      expect(primeira.jaEstava).toBe(false);
      expect(segunda.jaEstava).toBe(true);
      expect(
        await prisma.conversaEtiqueta.count({ where: { conversaId: c.conversaId } }),
      ).toBe(1);

      expect(await removerEtiqueta(c.conversaId, etiqueta.id)).toEqual({ removida: true });
      expect(await removerEtiqueta(c.conversaId, etiqueta.id)).toEqual({ removida: false });
    });
  });

  it("arquivar preserva o histórico: conversa encerrada continua com motivo e etiqueta", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");
    const {
      criarMotivoEncerramento,
      arquivarMotivoEncerramento,
      listarMotivosEncerramento,
      criarEtiqueta,
      arquivarEtiqueta,
      listarEtiquetas,
      aplicarEtiqueta,
    } = await import("./catalogos");

    const c = await montarCenario(`hist-${Date.now()}`);
    await runWithTenant({ empresaId: c.empresaId }, async () => {
      const motivo = await criarMotivoEncerramento("  Sem estoque  ");
      expect(motivo.nome).toBe("Sem estoque");
      const etiqueta = await criarEtiqueta({ nome: "Cotação" });
      await aplicarEtiqueta(c.conversaId, etiqueta.id);

      // o mês fecha com a conversa encerrada apontando para o motivo
      await prisma.conversa.updateMany({
        where: { id: c.conversaId },
        data: {
          estado: "encerrada",
          encerradaEm: new Date(),
          motivoEncerramentoId: motivo.id,
        },
      });

      await arquivarMotivoEncerramento(motivo.id);
      await arquivarEtiqueta(etiqueta.id);

      // saem do menu…
      expect(await listarMotivosEncerramento()).toHaveLength(0);
      expect(await listarEtiquetas()).toHaveLength(0);

      // …mas continuam existindo, e o relatório do mês passado fecha
      const arquivados = await listarMotivosEncerramento({ incluirArquivados: true });
      expect(arquivados.map((m) => [m.nome, m.ativo])).toEqual([["Sem estoque", false]]);
      expect(await listarEtiquetas({ incluirArquivadas: true })).toHaveLength(1);

      const encerrada = await prisma.conversa.findFirstOrThrow({
        where: { id: c.conversaId },
        include: { motivoEncerramento: true, etiquetas: true },
      });
      expect(encerrada.motivoEncerramento?.nome).toBe("Sem estoque");
      expect(encerrada.etiquetas).toHaveLength(1);

      // etiqueta arquivada não entra em conversa nova (o passado fica, o futuro não)
      await expect(aplicarEtiqueta(c.conversaId, etiqueta.id)).rejects.toThrow(/arquivada/);

      // recadastrar o mesmo nome RESSUSCITA a linha — o vínculo do histórico
      // continua sendo o mesmo id, e o unique (empresaId, nome) não estoura
      const denovo = await criarMotivoEncerramento("Sem estoque");
      expect(denovo.id).toBe(motivo.id);
      expect(denovo.ativo).toBe(true);
    });
  });

  it("nota interna fica na conversa e NUNCA vira Mensagem", async () => {
    const { prisma } = await import("../client");
    const { runWithTenant } = await import("../tenancy");
    const { criarNotaDeConversa, listarNotasDaConversa } = await import("./catalogos");

    const c = await montarCenario(`nota-${Date.now()}`);
    await runWithTenant({ empresaId: c.empresaId }, async () => {
      const nota = await criarNotaDeConversa(
        c.conversaId,
        c.usuarioId,
        "  Cliente é inadimplente — não prometer prazo.  ",
      );
      expect(nota.texto).toBe("Cliente é inadimplente — não prometer prazo.");
      expect(nota.autorNome).toContain("Atendente");

      const notas = await listarNotasDaConversa(c.conversaId);
      expect(notas).toHaveLength(1);

      // A prova: nada foi para a tabela que alimenta o envio ao cliente.
      expect(await prisma.mensagem.count({ where: { conversaId: c.conversaId } })).toBe(0);
      expect(await prisma.mensagem.count()).toBe(0);
    });
  });

  it("isolamento entre tenants: catálogo alheio é invisível e inaplicável", async () => {
    const { runWithTenant } = await import("../tenancy");
    const {
      criarMotivoEncerramento,
      listarMotivosEncerramento,
      criarEtiqueta,
      listarEtiquetas,
      aplicarEtiqueta,
      criarRespostaRapida,
      listarRespostasRapidas,
      listarNotasDaConversa,
      criarNotaDeConversa,
    } = await import("./catalogos");

    const s = Date.now();
    const a = await montarCenario(`iso-a-${s}`);
    const b = await montarCenario(`iso-b-${s}`);

    const doA = await runWithTenant({ empresaId: a.empresaId }, async () => {
      const etiqueta = await criarEtiqueta({ nome: "VIP" });
      await criarMotivoEncerramento("Resolvido");
      await criarRespostaRapida({ atalho: "/prazo", titulo: "Prazo", texto: "48h úteis." });
      await criarNotaDeConversa(a.conversaId, a.usuarioId, "Nota do tenant A");
      return { etiquetaId: etiqueta.id, conversaId: a.conversaId };
    });

    await runWithTenant({ empresaId: b.empresaId }, async () => {
      // nada do A aparece no B
      expect(await listarMotivosEncerramento({ incluirArquivados: true })).toHaveLength(0);
      expect(await listarEtiquetas({ incluirArquivadas: true })).toHaveLength(0);
      expect(await listarRespostasRapidas()).toHaveLength(0);

      // o MESMO atalho coexiste: o unique é composto com empresaId
      const doB = await criarRespostaRapida({
        atalho: "/prazo",
        titulo: "Prazo",
        texto: "72h úteis.",
      });
      expect(doB.atalho).toBe("prazo");

      // FK alheia não vira linha carimbada com o tenant certo
      await expect(aplicarEtiqueta(b.conversaId, doA.etiquetaId)).rejects.toThrow(
        /Etiqueta não encontrada/,
      );
      const etiquetaDeB = await criarEtiqueta({ nome: "VIP" });
      await expect(aplicarEtiqueta(doA.conversaId, etiquetaDeB.id)).rejects.toThrow(
        /Conversa não encontrada/,
      );

      // conversa e nota do outro tenant não são legíveis nem escrevíveis daqui
      await expect(listarNotasDaConversa(doA.conversaId)).rejects.toThrow(
        /Conversa não encontrada/,
      );
      await expect(
        criarNotaDeConversa(b.conversaId, a.usuarioId, "autor de outro tenant"),
      ).rejects.toThrow(/membro ativo/);
    });
  });
});
