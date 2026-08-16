-- Fase C — motor de IA: propose-confirm, resumos e feedback.
--
-- ESCRITA À MÃO e revisada: não houve banco de sombra disponível para gerar por
-- `prisma migrate diff`. Confira o plano contra o schema antes de aplicar.
--
-- É ADITIVA: só CREATE TYPE, CREATE TABLE, CREATE INDEX e ADD CONSTRAINT. Não
-- altera nem remove nada existente, então não há efeito sobre linha já gravada.
--
-- ⚠️ ORDEM OBRIGATÓRIA DE IMPLANTAÇÃO. O build do Workers Builds NÃO roda
-- `migrate deploy` (as migrations são aplicadas à mão contra o Neon). Aplique
-- ESTA migration primeiro, confirme no banco, e só então suba o código que usa
-- estas tabelas — na ordem inversa, o envio quebra em produção.

-- CreateEnum
CREATE TYPE "TipoProposta" AS ENUM ('montar_pedido', 'gerar_cobranca', 'enviar_contrato');

-- CreateEnum
-- MAIÚSCULAS por herança do ev-tracker (doc 02 §7, exceção declarada): mantém o
-- motor propose-confirm reusável sem renomear estados em código já provado.
CREATE TYPE "StatusProposta" AS ENUM ('PENDENTE', 'CONFIRMADA', 'EXPIRADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "TipoResumo" AS ENUM ('handoff', 'encerramento');

-- CreateEnum
CREATE TYPE "OrigemFeedback" AS ENUM ('cliente', 'atendente');

-- CreateTable
CREATE TABLE "PropostaAcao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "identidadeCanalId" TEXT NOT NULL,
    "tipo" "TipoProposta" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "StatusProposta" NOT NULL DEFAULT 'PENDENTE',
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executadaEm" TIMESTAMP(3),
    "resultadoJson" JSONB,
    "mensagemId" TEXT,

    CONSTRAINT "PropostaAcao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumoConversa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "tipo" "TipoResumo" NOT NULL,
    "texto" TEXT NOT NULL,
    "geradoPorModelo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumoConversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackIA" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "mensagemId" TEXT NOT NULL,
    "util" BOOLEAN NOT NULL,
    "comentario" TEXT,
    "origem" "OrigemFeedback" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropostaAcao_empresaId_conversaId_status_idx" ON "PropostaAcao"("empresaId", "conversaId", "status");

-- CreateIndex
-- Varredura do expirador: procura PENDENTE vencida sem varrer a tabela inteira.
CREATE INDEX "PropostaAcao_status_expiraEm_idx" ON "PropostaAcao"("status", "expiraEm");

-- CreateIndex
CREATE INDEX "ResumoConversa_empresaId_conversaId_criadoEm_idx" ON "ResumoConversa"("empresaId", "conversaId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackIA_empresaId_mensagemId_origem_key" ON "FeedbackIA"("empresaId", "mensagemId", "origem");

-- ÍNDICE PARCIAL — a regra que o Prisma não expressa.
--
-- "Só existe UMA proposta PENDENTE por conversa" (doc 05 §4). Sem isto, duas
-- propostas abertas ao mesmo tempo tornam um "sim" solto ambíguo, e a escolha
-- errada executa aquilo que o cliente NÃO quis — cobrar o pedido errado, por
-- exemplo. O `WHERE` é o que permite que as propostas já confirmadas, expiradas
-- ou rejeitadas convivam sem limite na mesma conversa.
CREATE UNIQUE INDEX "PropostaAcao_uma_pendente_por_conversa"
    ON "PropostaAcao"("empresaId", "conversaId")
    WHERE "status" = 'PENDENTE';

-- AddForeignKey
ALTER TABLE "PropostaAcao" ADD CONSTRAINT "PropostaAcao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaAcao" ADD CONSTRAINT "PropostaAcao_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumoConversa" ADD CONSTRAINT "ResumoConversa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumoConversa" ADD CONSTRAINT "ResumoConversa_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackIA" ADD CONSTRAINT "FeedbackIA_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
