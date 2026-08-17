-- CreateEnum
CREATE TYPE "StatusVersaoAgente" AS ENUM ('rascunho', 'publicada', 'arquivada');

-- CreateEnum
CREATE TYPE "CategoriaIntegracao" AS ENUM ('erp', 'crm', 'pagamento');

-- CreateEnum
CREATE TYPE "StatusIntegracao" AS ENUM ('conectada', 'erro', 'pausada');

-- CreateTable
CREATE TABLE "AgenteIA" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versaoAtivaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AgenteIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoAgente" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "StatusVersaoAgente" NOT NULL DEFAULT 'rascunho',
    "persona" TEXT NOT NULL,
    "provedor" TEXT NOT NULL DEFAULT 'anthropic',
    "modelo" TEXT,
    "toolsHabilitadas" JSONB NOT NULL DEFAULT '[]',
    "horarioAtuacao" JSONB,
    "handoffConfig" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicadaEm" TIMESTAMP(3),

    CONSTRAINT "VersaoAgente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoExterna" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "categoria" "CategoriaIntegracao" NOT NULL,
    "tipo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "credenciaisCifradas" TEXT NOT NULL,
    "webhookSecretCifrado" TEXT,
    "status" "StatusIntegracao" NOT NULL DEFAULT 'conectada',
    "ultimoErro" TEXT,
    "ultimaSincronizacao" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegracaoExterna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapeamentoEntidade" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "integracaoId" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "idLocal" TEXT NOT NULL,
    "idExterno" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapeamentoEntidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgenteIA_empresaId_ativo_idx" ON "AgenteIA"("empresaId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "AgenteIA_empresaId_nome_key" ON "AgenteIA"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "VersaoAgente_empresaId_agenteId_status_idx" ON "VersaoAgente"("empresaId", "agenteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VersaoAgente_empresaId_agenteId_numero_key" ON "VersaoAgente"("empresaId", "agenteId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoExterna_empresaId_categoria_tipo_key" ON "IntegracaoExterna"("empresaId", "categoria", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "MapeamentoEntidade_empresaId_integracaoId_entidade_idLocal_key" ON "MapeamentoEntidade"("empresaId", "integracaoId", "entidade", "idLocal");

-- CreateIndex
CREATE UNIQUE INDEX "MapeamentoEntidade_empresaId_integracaoId_entidade_idExtern_key" ON "MapeamentoEntidade"("empresaId", "integracaoId", "entidade", "idExterno");

-- AddForeignKey
ALTER TABLE "AgenteIA" ADD CONSTRAINT "AgenteIA_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersaoAgente" ADD CONSTRAINT "VersaoAgente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersaoAgente" ADD CONSTRAINT "VersaoAgente_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "AgenteIA"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoExterna" ADD CONSTRAINT "IntegracaoExterna_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoEntidade" ADD CONSTRAINT "MapeamentoEntidade_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapeamentoEntidade" ADD CONSTRAINT "MapeamentoEntidade_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "IntegracaoExterna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

