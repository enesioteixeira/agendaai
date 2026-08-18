-- E1 — a operação de atendimento e o billing da plataforma.
--
-- Duas famílias de tabela, e as duas existem pelo mesmo motivo: sem elas o
-- produto não é vendável.
--
-- ATENDIMENTO. Até aqui "fila" era um valor de estado: a conversa esperava
-- alguém, e não havia quem, nem prazo, nem escalonamento. Entram fila com
-- prazo de primeira resposta e forma de distribuição, membros da fila, motivo
-- de encerramento obrigatório, etiqueta, resposta rápida e nota interna. Em
-- `Conversa` entram a fila, o motivo, o instante da primeira resposta e o
-- prazo — este último GRAVADO e não derivado, porque mudar o prazo da fila não
-- pode reescrever o compromisso de conversas já em andamento.
--
-- PLATAFORMA. Plano, assinatura, uso mensal, uso por execução de modelo e
-- aceite de DPA. É o que falta para existir cobrança: hoje qualquer pessoa usa
-- de graça e o teto de custo de IA por plano é promessa, porque não há medição.
--
-- Migration inteiramente ADITIVA: nenhuma coluna existente muda de tipo e
-- nenhuma linha é reescrita. Pode ser aplicada com o produto no ar.

-- CreateEnum
CREATE TYPE "DistribuicaoFila" AS ENUM ('rodizio', 'carga', 'carteira', 'manual');

-- CreateEnum
CREATE TYPE "StatusAssinaturaPlataforma" AS ENUM ('trial', 'ativa', 'inadimplente', 'cancelada');

-- AlterTable
ALTER TABLE "Conversa" ADD COLUMN     "filaId" TEXT,
ADD COLUMN     "motivoEncerramentoId" TEXT,
ADD COLUMN     "prazoPrimeiraRespostaEm" TIMESTAMP(3),
ADD COLUMN     "primeiraRespostaEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Fila" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "prazoPrimeiraRespostaMin" INTEGER,
    "prazoResolucaoMin" INTEGER,
    "distribuicao" "DistribuicaoFila" NOT NULL DEFAULT 'manual',
    "horarioJson" JSONB,
    "mensagemForaHorario" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fila_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembroFila" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "filaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MembroFila_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotivoEncerramento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MotivoEncerramento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtiquetaConversa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EtiquetaConversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversaEtiqueta" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "etiquetaId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversaEtiqueta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespostaRapida" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "atalho" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "filaId" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RespostaRapida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaConversa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "autorUsuarioId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaConversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanoLicenca" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "precoMensalCentavos" INTEGER NOT NULL,
    "limiteUsuarios" INTEGER NOT NULL,
    "limiteCanais" INTEGER NOT NULL,
    "limiteConversasIaMes" INTEGER NOT NULL,
    "excedenteIaCentavos" INTEGER NOT NULL DEFAULT 49,
    "permiteApi" BOOLEAN NOT NULL DEFAULT false,
    "apiRateLimitRpm" INTEGER NOT NULL DEFAULT 60,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlanoLicenca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssinaturaPlataforma" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "status" "StatusAssinaturaPlataforma" NOT NULL DEFAULT 'trial',
    "trialAte" TIMESTAMP(3),
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceladaEm" TIMESTAMP(3),
    "idExternoCobranca" TEXT,

    CONSTRAINT "AssinaturaPlataforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsoMensal" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "mesReferencia" TEXT NOT NULL,
    "conversasIa" INTEGER NOT NULL DEFAULT 0,
    "mensagens" INTEGER NOT NULL DEFAULT 0,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSaida" INTEGER NOT NULL DEFAULT 0,
    "custoIaCentavos" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsoMensal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsoIA" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT,
    "agenteVersaoId" TEXT,
    "provedor" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tokensEntrada" INTEGER NOT NULL,
    "tokensSaida" INTEGER NOT NULL,
    "custoEstimadoCentavos" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsoIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DpaAceite" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "versaoDpa" TEXT NOT NULL,
    "aceitoPorUsuarioId" TEXT NOT NULL,
    "ipAceite" TEXT,
    "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DpaAceite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fila_empresaId_ativa_ordem_idx" ON "Fila"("empresaId", "ativa", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "Fila_empresaId_nome_key" ON "Fila"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "MembroFila_empresaId_usuarioId_idx" ON "MembroFila"("empresaId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "MembroFila_filaId_usuarioId_key" ON "MembroFila"("filaId", "usuarioId");

-- CreateIndex
CREATE INDEX "MotivoEncerramento_empresaId_ativo_idx" ON "MotivoEncerramento"("empresaId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "MotivoEncerramento_empresaId_nome_key" ON "MotivoEncerramento"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "EtiquetaConversa_empresaId_nome_key" ON "EtiquetaConversa"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "ConversaEtiqueta_empresaId_etiquetaId_idx" ON "ConversaEtiqueta"("empresaId", "etiquetaId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversaEtiqueta_conversaId_etiquetaId_key" ON "ConversaEtiqueta"("conversaId", "etiquetaId");

-- CreateIndex
CREATE INDEX "RespostaRapida_empresaId_ativa_idx" ON "RespostaRapida"("empresaId", "ativa");

-- CreateIndex
CREATE UNIQUE INDEX "RespostaRapida_empresaId_atalho_key" ON "RespostaRapida"("empresaId", "atalho");

-- CreateIndex
CREATE INDEX "NotaConversa_empresaId_conversaId_criadoEm_idx" ON "NotaConversa"("empresaId", "conversaId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "PlanoLicenca_chave_key" ON "PlanoLicenca"("chave");

-- CreateIndex
CREATE INDEX "AssinaturaPlataforma_empresaId_status_idx" ON "AssinaturaPlataforma"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UsoMensal_empresaId_mesReferencia_key" ON "UsoMensal"("empresaId", "mesReferencia");

-- CreateIndex
CREATE INDEX "UsoIA_empresaId_criadoEm_idx" ON "UsoIA"("empresaId", "criadoEm");

-- CreateIndex
CREATE INDEX "DpaAceite_empresaId_aceitoEm_idx" ON "DpaAceite"("empresaId", "aceitoEm");

-- CreateIndex
CREATE INDEX "Conversa_empresaId_prazoPrimeiraRespostaEm_idx" ON "Conversa"("empresaId", "prazoPrimeiraRespostaEm");

-- CreateIndex
CREATE INDEX "Conversa_empresaId_filaId_estado_idx" ON "Conversa"("empresaId", "filaId", "estado");

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_filaId_fkey" FOREIGN KEY ("filaId") REFERENCES "Fila"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_motivoEncerramentoId_fkey" FOREIGN KEY ("motivoEncerramentoId") REFERENCES "MotivoEncerramento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fila" ADD CONSTRAINT "Fila_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembroFila" ADD CONSTRAINT "MembroFila_filaId_fkey" FOREIGN KEY ("filaId") REFERENCES "Fila"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembroFila" ADD CONSTRAINT "MembroFila_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotivoEncerramento" ADD CONSTRAINT "MotivoEncerramento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtiquetaConversa" ADD CONSTRAINT "EtiquetaConversa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversaEtiqueta" ADD CONSTRAINT "ConversaEtiqueta_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversaEtiqueta" ADD CONSTRAINT "ConversaEtiqueta_etiquetaId_fkey" FOREIGN KEY ("etiquetaId") REFERENCES "EtiquetaConversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaRapida" ADD CONSTRAINT "RespostaRapida_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaRapida" ADD CONSTRAINT "RespostaRapida_filaId_fkey" FOREIGN KEY ("filaId") REFERENCES "Fila"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaConversa" ADD CONSTRAINT "NotaConversa_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaConversa" ADD CONSTRAINT "NotaConversa_autorUsuarioId_fkey" FOREIGN KEY ("autorUsuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssinaturaPlataforma" ADD CONSTRAINT "AssinaturaPlataforma_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssinaturaPlataforma" ADD CONSTRAINT "AssinaturaPlataforma_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "PlanoLicenca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsoMensal" ADD CONSTRAINT "UsoMensal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsoIA" ADD CONSTRAINT "UsoIA_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

