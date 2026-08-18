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
  const empresa = await prisma.empresa.upsert({
    where: { slug: "aurora-distribuidora" },
    create: {
      slug: "aurora-distribuidora",
      nome: "Aurora Distribuidora de Alimentos",
      cnpj: "12345678000190",
      vertical: "distribuidor_alimentos",
    },
    update: { vertical: "distribuidor_alimentos" },
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

  console.log(
    `demonstração: ${empresa.nome} — ${filas.length} filas, ${motivos.length} motivos, ` +
      `${etiquetas.length} etiquetas, ${respostas.length} respostas rápidas`,
  );
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
