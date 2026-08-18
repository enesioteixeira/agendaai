// Seed do catálogo de planos e do cenário de demonstração.
//
// Roda contra o banco LOCAL, nunca contra o Neon — o script recusa qualquer
// URL que não seja localhost, porque este arquivo cria e sobrescreve dados e
// este projeto já teve um incidente de comando rodado no lugar errado.
//
//   DATABASE_URL="postgresql://instant:devlocal@localhost:55432/instant_channel" \
//     pnpm --filter @atende/db seed
//
// O catálogo de planos NÃO é dado de demonstração: sem ele não existe
// assinatura, e sem assinatura não existe cobrança. Ele precisa existir em
// qualquer ambiente, inclusive produção — lá, aplicado como migration de dados
// ou por este mesmo script apontado para o destino certo, conscientemente.

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { cadastroInicial } from "../src/identidade/onboarding";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error(
    "seed recusado: DATABASE_URL precisa apontar para localhost.\n" +
      "Este script escreve dados. Para semear outro destino, faça isso de propósito e à mão.",
  );
  process.exit(1);
}

// O client deste repo é gerado com engineType "client" (query compiler WASM,
// exigência do Cloudflare Workers), e nesse modo ele SÓ funciona com driver
// adapter — sem ele o Prisma devolve P2038. Mesmo padrão de packages/db/src/unsafe.ts.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

/**
 * Credenciais da demonstração local. Ficam no código de propósito: é ambiente
 * local, descartável, e o valor de estarem escritas é que qualquer pessoa da
 * equipe abre o painel sem perguntar a senha para ninguém.
 */
const SLUG_DEMO = "aurora-distribuidora";
const EMAIL_DEMO = "ana@aurora.com.br";
const SENHA_DEMO = "aurora-local-123";

/**
 * Os planos da Onda 1, com os valores da tabela do acervo de empresa
 * (04-precificacao). São indicativos até passarem por 8 a 10 propostas reais —
 * e "indicativo" é vocabulário interno: na proposta o número vai firme.
 *
 * Os limites são um primeiro corte e precisam ser confirmados com uso real:
 * conversa de IA por mês é o que mais depende do perfil do cliente, e um
 * distribuidor com televendas ativo consome muito mais que a estimativa.
 */
const PLANOS = [
  {
    chave: "entrada",
    nome: "Entrada",
    precoMensalCentavos: 69_000,
    limiteUsuarios: 5,
    limiteCanais: 1,
    limiteConversasIaMes: 500,
    excedenteIaCentavos: 49,
    permiteApi: false,
    apiRateLimitRpm: 0,
    ordem: 1,
  },
  {
    chave: "crescimento",
    nome: "Crescimento",
    precoMensalCentavos: 119_000,
    limiteUsuarios: 15,
    limiteCanais: 3,
    limiteConversasIaMes: 1_500,
    excedenteIaCentavos: 49,
    permiteApi: true,
    apiRateLimitRpm: 120,
    ordem: 2,
  },
  {
    // Existe para o programa Fundadores: preço congelado por 36 meses, limites
    // do Crescimento, e a API liberada porque esses clientes são os que mais
    // pedem integração. Não aparece em tabela pública.
    chave: "fundador",
    nome: "Fundador",
    precoMensalCentavos: 119_000,
    limiteUsuarios: 15,
    limiteCanais: 3,
    limiteConversasIaMes: 1_500,
    excedenteIaCentavos: 49,
    permiteApi: true,
    apiRateLimitRpm: 120,
    ordem: 3,
  },
] as const;

async function semearPlanos(): Promise<void> {
  for (const plano of PLANOS) {
    await prisma.planoLicenca.upsert({
      where: { chave: plano.chave },
      create: plano,
      update: plano,
    });
  }
  console.log(`planos: ${PLANOS.length} no catálogo`);
}

/**
 * Cenário de demonstração: um distribuidor de alimentos secos com entrega.
 *
 * O cenário importa tanto quanto o código. O anterior era uma indústria
 * eletrônica em São Paulo — que é anti-perfil por dois motivos ao mesmo tempo —
 * e a demonstração precisa que o prospect reconheça a operação dele: rota,
 * centro de distribuição, carteira de varejista, item de curva A em ruptura.
 */
async function semearDemonstracao(): Promise<void> {
  // Cria pelo MESMO caminho que um cliente real usaria (cadastroInicial), e não
  // por insert direto. A diferença não é purismo: o caminho real cria também o
  // usuário dono, os quatro papéis com os nomes da vertical e os escopos. Um
  // seed que insere a empresa na mão produz um tenant no qual ninguém consegue
  // entrar — foi o que aconteceu na primeira versão deste arquivo.
  const existente = await prisma.empresa.findUnique({ where: { slug: SLUG_DEMO } });
  const empresaId = existente
    ? existente.id
    : (
        await cadastroInicial({
          nome: "Ana Prado",
          email: EMAIL_DEMO,
          senha: SENHA_DEMO,
          empresaNome: "Aurora Distribuidora de Alimentos",
          empresaSlug: SLUG_DEMO,
          vertical: "distribuidor_alimentos",
          unidadeNome: "CD Matriz",
          fusoHorario: "America/Sao_Paulo",
        })
      ).empresaId;

  const empresa = await prisma.empresa.update({
    where: { id: empresaId },
    data: { vertical: "distribuidor_alimentos", cnpj: "12345678000190" },
  });

  const plano = await prisma.planoLicenca.findUniqueOrThrow({ where: { chave: "crescimento" } });
  const assinaturaExistente = await prisma.assinaturaPlataforma.findFirst({
    where: { empresaId: empresa.id, status: { not: "cancelada" } },
  });
  if (!assinaturaExistente) {
    await prisma.assinaturaPlataforma.create({
      data: {
        empresaId: empresa.id,
        planoId: plano.id,
        status: "trial",
        trialAte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // As filas de um distribuidor, com os prazos que o gerente comercial cobra.
  // Televendas tem o prazo mais curto porque é onde o pedido nasce: varejista
  // sem resposta em quinze minutos liga para o concorrente.
  const filas = [
    {
      nome: "Televendas",
      descricao: "Pedido de reposição e dúvida de preço do varejista",
      prazoPrimeiraRespostaMin: 15,
      prazoResolucaoMin: 120,
      distribuicao: "carteira" as const,
      ordem: 1,
    },
    {
      nome: "Pós-venda",
      descricao: "Entrega, devolução e ocorrência",
      prazoPrimeiraRespostaMin: 60,
      prazoResolucaoMin: 480,
      distribuicao: "carga" as const,
      ordem: 2,
    },
    {
      nome: "Financeiro",
      descricao: "Boleto, prazo e limite de crédito",
      prazoPrimeiraRespostaMin: 120,
      prazoResolucaoMin: 1440,
      distribuicao: "rodizio" as const,
      ordem: 3,
    },
  ];

  for (const fila of filas) {
    await prisma.fila.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome: fila.nome } },
      create: {
        ...fila,
        empresaId: empresa.id,
        horarioJson: {
          fuso: "America/Sao_Paulo",
          dias: {
            seg: [["08:00", "18:00"]],
            ter: [["08:00", "18:00"]],
            qua: [["08:00", "18:00"]],
            qui: [["08:00", "18:00"]],
            sex: [["08:00", "18:00"]],
            sab: [["08:00", "12:00"]],
          },
        },
        mensagemForaHorario:
          "Recebi sua mensagem! Nosso atendimento vai das 8h às 18h, e a gente responde assim que abrir.",
      },
      update: {},
    });
  }

  const motivos = [
    "Pedido realizado",
    "Consulta de preço",
    "Sem estoque",
    "Reclamação de entrega",
    "Devolução",
    "Cliente não respondeu",
  ];
  for (const [i, nome] of motivos.entries()) {
    await prisma.motivoEncerramento.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome } },
      create: { empresaId: empresa.id, nome, ordem: i },
      update: {},
    });
  }

  const etiquetas = [
    { nome: "Urgente", cor: "perigo" },
    { nome: "Curva A", cor: "atencao" },
    { nome: "Cliente novo", cor: "info" },
    { nome: "Reativação", cor: "sucesso" },
  ];
  for (const etiqueta of etiquetas) {
    await prisma.etiquetaConversa.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome: etiqueta.nome } },
      create: { empresaId: empresa.id, ...etiqueta },
      update: {},
    });
  }

  // Respostas rápidas na língua do cliente — é o que o painel chama de falar
  // verba de fornecedor e corte de pedido em vez de "solução".
  const respostas = [
    {
      atalho: "prazo",
      titulo: "Prazo de entrega da rota",
      texto:
        "A rota da sua região sai {{dia}} e a entrega costuma chegar no mesmo dia. Confirmo o horário assim que o carregamento fechar.",
    },
    {
      atalho: "corte",
      titulo: "Corte de pedido por estoque",
      texto:
        "Um item do seu pedido ficou sem estoque para esta rota. Posso substituir por um similar ou mando o restante e o item cortado entra na próxima. Como você prefere?",
    },
    {
      atalho: "boleto",
      titulo: "Segunda via de boleto",
      texto: "Já peço a segunda via para o financeiro e te mando aqui mesmo, no seu WhatsApp.",
    },
  ];
  for (const resposta of respostas) {
    await prisma.respostaRapida.upsert({
      where: { empresaId_atalho: { empresaId: empresa.id, atalho: resposta.atalho } },
      create: { empresaId: empresa.id, ...resposta },
      update: {},
    });
  }

  const conversas = await semearConversas(empresa.id);

  console.log(
    `demonstração: ${empresa.nome} — ${filas.length} filas, ${motivos.length} motivos, ` +
      `${etiquetas.length} etiquetas, ${respostas.length} respostas rápidas, ` +
      `${conversas} conversas`,
  );
  console.log(`entre em http://localhost:3000/login com ${EMAIL_DEMO} / ${SENHA_DEMO}`);
}

/**
 * Conversas de demonstração.
 *
 * Sem elas a inbox — a tela em que o produto é julgado — abre vazia, e nem
 * quem desenvolve consegue ver funcionando o que foi construído: roteamento
 * por fila, prazo de primeira resposta, dono, não lidas, encerramento com
 * motivo. O cenário é escolhido para exercitar os três estados de prazo ao
 * mesmo tempo: uma dentro do prazo, uma estourada e uma já respondida.
 *
 * Os instantes são relativos ao momento do seed, e não datas fixas: uma data
 * fixa envelhece e, uma semana depois, "dentro do prazo" aparece vermelho.
 */
async function semearConversas(empresaId: string): Promise<number> {
  const jaTem = await prisma.conversa.count({ where: { empresaId } });
  if (jaTem > 0) return jaTem;

  const dona = await prisma.vinculoUsuarioEmpresa.findFirstOrThrow({
    where: { empresaId },
    select: { usuarioId: true },
  });
  const filaPorNome = new Map(
    (await prisma.fila.findMany({ where: { empresaId } })).map((f) => [f.nome, f]),
  );
  const motivoPorNome = new Map(
    (await prisma.motivoEncerramento.findMany({ where: { empresaId } })).map((m) => [
      m.nome,
      m,
    ]),
  );
  const etiquetaPorNome = new Map(
    (await prisma.etiquetaConversa.findMany({ where: { empresaId } })).map((e) => [
      e.nome,
      e,
    ]),
  );

  const canal = await prisma.canal.create({
    data: {
      empresaId,
      tipo: "whatsapp_baileys",
      nome: "WhatsApp Televendas",
      statusConexao: "desconectado",
    },
  });

  const MIN = 60_000;
  const agora = Date.now();
  const cenarios = [
    {
      cliente: "Mercado do Bairro",
      razaoSocial: "Mercado do Bairro Comércio de Alimentos LTDA",
      cnpj: "11222333000181",
      telefone: "+5548988770011",
      fila: "Televendas",
      etiqueta: "Curva A",
      // Chegou há 4 minutos numa fila de 15: dentro do prazo, e é a que o
      // atendente deve pegar primeiro.
      entrouHaMin: 4,
      respondidaHaMin: null,
      dona: false,
      encerra: null,
      mensagens: [
        "Bom dia! Preciso repor arroz 5kg e feijão pra rota de quinta. Consegue me passar o preço?",
        "Se tiver a marca da última compra eu fecho hoje ainda.",
      ],
    },
    {
      cliente: "Empório São Jorge",
      razaoSocial: "Empório São Jorge Mercearia EIRELI",
      cnpj: "44555666000172",
      telefone: "+5548991234567",
      fila: "Pós-venda",
      etiqueta: "Urgente",
      // Entrou há 2 horas numa fila de 1 hora e ninguém respondeu: prazo
      // estourado. É o caso que o painel existe para tornar impossível de
      // passar despercebido.
      entrouHaMin: 120,
      respondidaHaMin: null,
      dona: false,
      encerra: null,
      mensagens: [
        "A entrega de ontem veio com duas caixas de óleo faltando.",
        "Já conferi com o motorista e ele disse pra falar com vocês.",
      ],
    },
    {
      cliente: "Rede Bom Preço",
      razaoSocial: "Rede Bom Preço Supermercados S/A",
      cnpj: "77888999000163",
      telefone: "+5548997654321",
      fila: "Financeiro",
      etiqueta: "Cliente novo",
      entrouHaMin: 45,
      respondidaHaMin: 38,
      dona: true,
      encerra: null,
      mensagens: [
        "Preciso da segunda via do boleto que venceu sexta.",
        "Pode mandar por aqui mesmo.",
      ],
    },
    {
      cliente: "Atacado Vale Verde",
      razaoSocial: "Atacado Vale Verde Distribuição LTDA",
      cnpj: "10101010000110",
      telefone: "+5548993334444",
      fila: "Televendas",
      etiqueta: "Reativação",
      entrouHaMin: 300,
      respondidaHaMin: 296,
      dona: true,
      encerra: "Pedido realizado",
      mensagens: ["Fecha pra mim 20 fardos de açúcar na rota de sexta?"],
    },
  ];

  for (const c of cenarios) {
    const cliente = await prisma.cliente.create({
      data: {
        empresaId,
        nome: c.cliente,
        razaoSocial: c.razaoSocial,
        cnpj: c.cnpj,
        tipoPessoa: "juridica",
        telefone: c.telefone,
      },
    });
    const identidade = await prisma.identidadeCanal.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        tipo: "whatsapp",
        valor: c.telefone.replace("+", ""),
      },
    });

    const entrouEm = new Date(agora - c.entrouHaMin * MIN);
    const fila = filaPorNome.get(c.fila);
    const encerrada = c.encerra !== null;

    const conversa = await prisma.conversa.create({
      data: {
        empresaId,
        canalId: canal.id,
        clienteId: cliente.id,
        identidadeCanalId: identidade.id,
        estado: encerrada ? "encerrada" : c.dona ? "humano" : "fila_humano",
        filaId: fila?.id ?? null,
        atendenteUsuarioId: c.dona ? dona.usuarioId : null,
        criadoEm: entrouEm,
        // O prazo é gravado na entrada a partir da fila, exatamente como o
        // roteamento faz em produção — não recalculado na leitura.
        prazoPrimeiraRespostaEm: fila?.prazoPrimeiraRespostaMin
          ? new Date(entrouEm.getTime() + fila.prazoPrimeiraRespostaMin * MIN)
          : null,
        primeiraRespostaEm:
          c.respondidaHaMin === null ? null : new Date(agora - c.respondidaHaMin * MIN),
        encerradaEm: encerrada ? new Date(agora - 240 * MIN) : null,
        motivoEncerramentoId: c.encerra ? (motivoPorNome.get(c.encerra)?.id ?? null) : null,
      },
    });

    // `atualizadoEm` é `@updatedAt` e o Prisma o carimba com AGORA no create,
    // ignorando o valor passado. Sem este ajuste as quatro conversas nascem
    // "atualizadas agora" e a inbox — que ordena por este campo — mostra a
    // demonstração toda empatada, escondendo justamente a ordenação que se quer
    // demonstrar. Por isso vai em SQL cru, que passa por cima do `@updatedAt`.
    const ultimoToque = new Date(
      agora - (c.respondidaHaMin ?? c.entrouHaMin - (c.mensagens.length - 1)) * MIN,
    );
    await prisma.$executeRaw`UPDATE "Conversa" SET "atualizadoEm" = ${ultimoToque} WHERE id = ${conversa.id}`;

    const etiqueta = etiquetaPorNome.get(c.etiqueta);
    if (etiqueta) {
      await prisma.conversaEtiqueta.create({
        data: { empresaId, conversaId: conversa.id, etiquetaId: etiqueta.id },
      });
    }

    for (const [i, texto] of c.mensagens.entries()) {
      await prisma.mensagem.create({
        data: {
          empresaId,
          canalId: canal.id,
          conversaId: conversa.id,
          direcao: "entrada",
          origemMotor: "cliente",
          texto,
          criadoEm: new Date(entrouEm.getTime() + i * MIN),
        },
      });
    }

    if (c.respondidaHaMin !== null) {
      await prisma.mensagem.create({
        data: {
          empresaId,
          canalId: canal.id,
          conversaId: conversa.id,
          direcao: "saida",
          origemMotor: "humano",
          autorUsuarioId: dona.usuarioId,
          texto: encerrada
            ? "Fechado! Pedido lançado para a rota de sexta, te mando o número da nota assim que faturar."
            : "Já peço a segunda via para o financeiro e te mando aqui mesmo, no seu WhatsApp.",
          statusEntrega: "entregue",
          criadoEm: new Date(agora - c.respondidaHaMin * MIN),
        },
      });
    }
  }

  return cenarios.length;
}

async function main(): Promise<void> {
  await semearPlanos();
  await semearDemonstracao();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
