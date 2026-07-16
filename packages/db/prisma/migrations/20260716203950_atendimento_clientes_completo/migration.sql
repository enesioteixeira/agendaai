-- CreateEnum
CREATE TYPE "TipoIdentidade" AS ENUM ('whatsapp', 'instagram', 'messenger', 'telegram', 'email', 'webchat');

-- CreateEnum
CREATE TYPE "TipoCanal" AS ENUM ('whatsapp_oficial', 'whatsapp_baileys', 'telegram', 'webchat', 'instagram', 'messenger', 'email');

-- CreateEnum
CREATE TYPE "StatusConexaoCanal" AS ENUM ('desconectado', 'pareando', 'conectado', 'erro');

-- CreateEnum
CREATE TYPE "EstadoConversa" AS ENUM ('bot_arvore', 'bot_ia', 'fila_humano', 'humano', 'encerrada');

-- CreateEnum
CREATE TYPE "DirecaoMensagem" AS ENUM ('entrada', 'saida');

-- CreateEnum
CREATE TYPE "TipoMensagem" AS ENUM ('texto', 'imagem', 'audio', 'video', 'documento', 'localizacao', 'interativo');

-- CreateEnum
CREATE TYPE "OrigemMensagem" AS ENUM ('cliente', 'arvore', 'ia', 'humano', 'sistema');

-- CreateEnum
CREATE TYPE "StatusEntrega" AS ENUM ('pendente', 'enviada', 'entregue', 'lida', 'falhou');

-- CreateTable
CREATE TABLE "IdentidadeCanal" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" "TipoIdentidade" NOT NULL,
    "valor" TEXT NOT NULL,
    "verificada" BOOLEAN NOT NULL DEFAULT false,
    "verificadaEm" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "IdentidadeCanal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaCliente" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "autorUsuarioId" TEXT,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "NotaCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagCliente" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,

    CONSTRAINT "TagCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Canal" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "unidadeId" TEXT,
    "tipo" "TipoCanal" NOT NULL,
    "nome" TEXT NOT NULL,
    "configCifrada" TEXT,
    "statusConexao" "StatusConexaoCanal" NOT NULL DEFAULT 'desconectado',
    "fluxoPadraoId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Canal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "canalId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "identidadeCanalId" TEXT NOT NULL,
    "estado" "EstadoConversa" NOT NULL,
    "atendenteUsuarioId" TEXT,
    "fluxoVersaoId" TEXT,
    "noAtualId" TEXT,
    "variaveis" JSONB,
    "contextoJson" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "encerradaEm" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "canalId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "direcao" "DirecaoMensagem" NOT NULL,
    "tipo" "TipoMensagem" NOT NULL DEFAULT 'texto',
    "origemMotor" "OrigemMensagem" NOT NULL,
    "texto" TEXT,
    "midia" JSONB,
    "idExterno" TEXT,
    "respostaA" TEXT,
    "autorUsuarioId" TEXT,
    "statusEntrega" "StatusEntrega" NOT NULL DEFAULT 'pendente',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arquivadaEm" TIMESTAMP(3),
    "ponteiroR2" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthStateBaileys" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "canalId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valorCifrado" TEXT NOT NULL,

    CONSTRAINT "AuthStateBaileys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdentidadeCanal_empresaId_clienteId_idx" ON "IdentidadeCanal"("empresaId", "clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentidadeCanal_empresaId_tipo_valor_key" ON "IdentidadeCanal"("empresaId", "tipo", "valor");

-- CreateIndex
CREATE INDEX "NotaCliente_empresaId_clienteId_idx" ON "NotaCliente"("empresaId", "clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_empresaId_nome_key" ON "Tag"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "TagCliente_empresaId_tagId_clienteId_key" ON "TagCliente"("empresaId", "tagId", "clienteId");

-- CreateIndex
CREATE INDEX "Canal_empresaId_idx" ON "Canal"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Canal_empresaId_nome_key" ON "Canal"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "Conversa_empresaId_estado_atualizadoEm_idx" ON "Conversa"("empresaId", "estado", "atualizadoEm");

-- CreateIndex
CREATE INDEX "Mensagem_conversaId_criadoEm_idx" ON "Mensagem"("conversaId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Mensagem_empresaId_canalId_idExterno_key" ON "Mensagem"("empresaId", "canalId", "idExterno");

-- CreateIndex
CREATE UNIQUE INDEX "AuthStateBaileys_empresaId_canalId_chave_key" ON "AuthStateBaileys"("empresaId", "canalId", "chave");

-- AddForeignKey
ALTER TABLE "IdentidadeCanal" ADD CONSTRAINT "IdentidadeCanal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentidadeCanal" ADD CONSTRAINT "IdentidadeCanal_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCliente" ADD CONSTRAINT "NotaCliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCliente" ADD CONSTRAINT "NotaCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCliente" ADD CONSTRAINT "NotaCliente_autorUsuarioId_fkey" FOREIGN KEY ("autorUsuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagCliente" ADD CONSTRAINT "TagCliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagCliente" ADD CONSTRAINT "TagCliente_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagCliente" ADD CONSTRAINT "TagCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Canal" ADD CONSTRAINT "Canal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Canal" ADD CONSTRAINT "Canal_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "Canal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_identidadeCanalId_fkey" FOREIGN KEY ("identidadeCanalId") REFERENCES "IdentidadeCanal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_atendenteUsuarioId_fkey" FOREIGN KEY ("atendenteUsuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "Canal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_autorUsuarioId_fkey" FOREIGN KEY ("autorUsuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthStateBaileys" ADD CONSTRAINT "AuthStateBaileys_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthStateBaileys" ADD CONSTRAINT "AuthStateBaileys_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "Canal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- SQL MANUAL (doc 02 §14.1): índice parcial do job de arquivamento
-- de mensagens >90 dias (WHERE não é expressável no Prisma).
-- ─────────────────────────────────────────────────────────────
CREATE INDEX "Mensagem_empresaId_criadoEm_ativas_idx"
  ON "Mensagem" ("empresaId", "criadoEm")
  WHERE "arquivadaEm" IS NULL;
