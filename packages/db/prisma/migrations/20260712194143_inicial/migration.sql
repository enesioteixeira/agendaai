-- CreateEnum
CREATE TYPE "VerticalEmpresa" AS ENUM ('salao', 'barbearia', 'clinica_estetica', 'clinica_medica', 'advocacia', 'outro');

-- CreateEnum
CREATE TYPE "StatusConvite" AS ENUM ('pendente', 'aceito', 'expirado', 'revogado');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "vertical" "VerticalEmpresa" NOT NULL,
    "planoId" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unidade" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "fusoHorario" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "endereco" JSONB,
    "horariosFuncionamento" JSONB,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Unidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VinculoUsuarioEmpresa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "papelId" TEXT NOT NULL,
    "unidadesPermitidas" JSONB NOT NULL DEFAULT '[]',
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VinculoUsuarioEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Papel" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sistema" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Papel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escopo" (
    "chave" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "Escopo_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "PapelEscopo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "papelId" TEXT NOT NULL,
    "escopoChave" TEXT NOT NULL,

    CONSTRAINT "PapelEscopo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "hashChave" TEXT NOT NULL,
    "escopos" JSONB NOT NULL DEFAULT '[]',
    "rateLimitRpm" INTEGER NOT NULL,
    "ultimoUsoEm" TIMESTAMP(3),
    "expiraEm" TIMESTAMP(3),
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConviteUsuario" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "papelId" TEXT NOT NULL,
    "unidadesPermitidas" JSONB NOT NULL DEFAULT '[]',
    "tokenHash" TEXT NOT NULL,
    "status" "StatusConvite" NOT NULL DEFAULT 'pendente',
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConviteUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_slug_key" ON "Empresa"("slug");

-- CreateIndex
CREATE INDEX "Unidade_empresaId_idx" ON "Unidade"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Unidade_empresaId_nome_key" ON "Unidade"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "VinculoUsuarioEmpresa_empresaId_idx" ON "VinculoUsuarioEmpresa"("empresaId");

-- CreateIndex
CREATE INDEX "VinculoUsuarioEmpresa_usuarioId_idx" ON "VinculoUsuarioEmpresa"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "VinculoUsuarioEmpresa_empresaId_usuarioId_key" ON "VinculoUsuarioEmpresa"("empresaId", "usuarioId");

-- CreateIndex
CREATE INDEX "Papel_empresaId_idx" ON "Papel"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Papel_empresaId_nome_key" ON "Papel"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "PapelEscopo_empresaId_idx" ON "PapelEscopo"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "PapelEscopo_empresaId_papelId_escopoChave_key" ON "PapelEscopo"("empresaId", "papelId", "escopoChave");

-- CreateIndex
CREATE INDEX "ApiKey_empresaId_idx" ON "ApiKey"("empresaId");

-- CreateIndex
CREATE INDEX "ConviteUsuario_empresaId_email_idx" ON "ConviteUsuario"("empresaId", "email");

-- AddForeignKey
ALTER TABLE "Unidade" ADD CONSTRAINT "Unidade_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoUsuarioEmpresa" ADD CONSTRAINT "VinculoUsuarioEmpresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoUsuarioEmpresa" ADD CONSTRAINT "VinculoUsuarioEmpresa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoUsuarioEmpresa" ADD CONSTRAINT "VinculoUsuarioEmpresa_papelId_fkey" FOREIGN KEY ("papelId") REFERENCES "Papel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Papel" ADD CONSTRAINT "Papel_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PapelEscopo" ADD CONSTRAINT "PapelEscopo_papelId_fkey" FOREIGN KEY ("papelId") REFERENCES "Papel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PapelEscopo" ADD CONSTRAINT "PapelEscopo_escopoChave_fkey" FOREIGN KEY ("escopoChave") REFERENCES "Escopo"("chave") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConviteUsuario" ADD CONSTRAINT "ConviteUsuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConviteUsuario" ADD CONSTRAINT "ConviteUsuario_papelId_fkey" FOREIGN KEY ("papelId") REFERENCES "Papel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
