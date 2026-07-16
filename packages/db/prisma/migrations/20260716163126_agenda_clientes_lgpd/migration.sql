-- CreateEnum
CREATE TYPE "StatusAgendamento" AS ENUM ('agendado', 'confirmado', 'em_atendimento', 'concluido', 'cancelado', 'nao_compareceu');

-- CreateEnum
CREATE TYPE "OrigemAgendamento" AS ENUM ('painel', 'booking', 'ia', 'arvore');

-- CreateEnum
CREATE TYPE "TipoRecurso" AS ENUM ('sala', 'cadeira', 'equipamento');

-- CreateEnum
CREATE TYPE "TipoBloqueio" AS ENUM ('ferias', 'almoco', 'manutencao', 'outro');

-- CreateEnum
CREATE TYPE "EstadoSyncGcal" AS ENUM ('desconectado', 'ativo', 'erro_token', 'pausado');

-- CreateEnum
CREATE TYPE "TipoSolicitacaoLGPD" AS ENUM ('acesso', 'correcao', 'exclusao', 'portabilidade', 'revogacao_consentimento');

-- CreateEnum
CREATE TYPE "StatusSolicitacaoLGPD" AS ENUM ('aberta', 'em_andamento', 'concluida', 'recusada');

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "cpf" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "endereco" JSONB,
    "observacoes" TEXT,
    "provisorio" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profissional" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "nome" TEXT NOT NULL,
    "cor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Profissional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servico" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "duracaoMin" INTEGER NOT NULL,
    "precoCentavos" INTEGER NOT NULL,
    "exigeContrato" BOOLEAN NOT NULL DEFAULT false,
    "exigeSinal" BOOLEAN NOT NULL DEFAULT false,
    "percentualSinalBp" INTEGER,
    "visivelNaBooking" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recurso" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoRecurso" NOT NULL,
    "capacidade" INTEGER NOT NULL DEFAULT 1,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Recurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorarioTrabalho" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "profissionalId" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,

    CONSTRAINT "HorarioTrabalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bloqueio" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoBloqueio" NOT NULL,
    "profissionalId" TEXT,
    "recursoId" TEXT,
    "unidadeId" TEXT,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "motivo" TEXT,

    CONSTRAINT "Bloqueio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agendamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "profissionalId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "recursoId" TEXT,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "status" "StatusAgendamento" NOT NULL DEFAULT 'agendado',
    "origem" "OrigemAgendamento" NOT NULL,
    "observacoes" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "eventoGcalId" TEXT,

    CONSTRAINT "Agendamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SincronizacaoGcal" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "profissionalId" TEXT NOT NULL,
    "tokensCifrados" TEXT NOT NULL,
    "estadoSync" "EstadoSyncGcal" NOT NULL DEFAULT 'desconectado',
    "syncTokenGcal" TEXT,
    "canalWatchId" TEXT,
    "canalExpiraEm" TIMESTAMP(3),
    "ultimaSyncEm" TIMESTAMP(3),

    CONSTRAINT "SincronizacaoGcal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "dadosAntes" JSONB,
    "dadosDepois" JSONB,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "rota" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentimentoLGPD" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "tipo" TEXT NOT NULL,
    "concedido" BOOLEAN NOT NULL,
    "textoVersao" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentimentoLGPD_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitacaoLGPD" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "tipo" "TipoSolicitacaoLGPD" NOT NULL,
    "status" "StatusSolicitacaoLGPD" NOT NULL DEFAULT 'aberta',
    "protocolo" TEXT NOT NULL,
    "abertaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidaEm" TIMESTAMP(3),
    "respostaR2" TEXT,

    CONSTRAINT "SolicitacaoLGPD_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigLgpd" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "retencaoMensagensDias" INTEGER NOT NULL DEFAULT 365,
    "retencaoLogsDias" INTEGER NOT NULL DEFAULT 365,
    "textoConsentimento" TEXT,
    "dpoNome" TEXT,
    "dpoEmail" TEXT,

    CONSTRAINT "ConfigLgpd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cliente_empresaId_idx" ON "Cliente"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_empresaId_cpf_key" ON "Cliente"("empresaId", "cpf");

-- CreateIndex
CREATE INDEX "Profissional_empresaId_unidadeId_idx" ON "Profissional"("empresaId", "unidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "Servico_empresaId_nome_key" ON "Servico"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Recurso_empresaId_unidadeId_nome_key" ON "Recurso"("empresaId", "unidadeId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "HorarioTrabalho_empresaId_profissionalId_unidadeId_diaSeman_key" ON "HorarioTrabalho"("empresaId", "profissionalId", "unidadeId", "diaSemana", "horaInicio");

-- CreateIndex
CREATE INDEX "Bloqueio_empresaId_inicio_idx" ON "Bloqueio"("empresaId", "inicio");

-- CreateIndex
CREATE INDEX "Agendamento_empresaId_unidadeId_inicio_idx" ON "Agendamento"("empresaId", "unidadeId", "inicio");

-- CreateIndex
CREATE INDEX "Agendamento_empresaId_profissionalId_inicio_idx" ON "Agendamento"("empresaId", "profissionalId", "inicio");

-- CreateIndex
CREATE INDEX "Agendamento_empresaId_clienteId_inicio_idx" ON "Agendamento"("empresaId", "clienteId", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "SincronizacaoGcal_profissionalId_key" ON "SincronizacaoGcal"("profissionalId");

-- CreateIndex
CREATE UNIQUE INDEX "SincronizacaoGcal_empresaId_profissionalId_key" ON "SincronizacaoGcal"("empresaId", "profissionalId");

-- CreateIndex
CREATE INDEX "AuditLog_empresaId_criadoEm_idx" ON "AuditLog"("empresaId", "criadoEm");

-- CreateIndex
CREATE INDEX "AccessLog_empresaId_criadoEm_idx" ON "AccessLog"("empresaId", "criadoEm");

-- CreateIndex
CREATE INDEX "ConsentimentoLGPD_empresaId_clienteId_idx" ON "ConsentimentoLGPD"("empresaId", "clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitacaoLGPD_empresaId_protocolo_key" ON "SolicitacaoLGPD"("empresaId", "protocolo");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigLgpd_empresaId_key" ON "ConfigLgpd"("empresaId");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profissional" ADD CONSTRAINT "Profissional_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profissional" ADD CONSTRAINT "Profissional_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profissional" ADD CONSTRAINT "Profissional_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Servico" ADD CONSTRAINT "Servico_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurso" ADD CONSTRAINT "Recurso_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurso" ADD CONSTRAINT "Recurso_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioTrabalho" ADD CONSTRAINT "HorarioTrabalho_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioTrabalho" ADD CONSTRAINT "HorarioTrabalho_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Profissional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioTrabalho" ADD CONSTRAINT "HorarioTrabalho_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bloqueio" ADD CONSTRAINT "Bloqueio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bloqueio" ADD CONSTRAINT "Bloqueio_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Profissional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bloqueio" ADD CONSTRAINT "Bloqueio_recursoId_fkey" FOREIGN KEY ("recursoId") REFERENCES "Recurso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bloqueio" ADD CONSTRAINT "Bloqueio_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Profissional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_recursoId_fkey" FOREIGN KEY ("recursoId") REFERENCES "Recurso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SincronizacaoGcal" ADD CONSTRAINT "SincronizacaoGcal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SincronizacaoGcal" ADD CONSTRAINT "SincronizacaoGcal_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Profissional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- SQL MANUAL (doc 02 §3.1) — Prisma não expressa EXCLUDE.
-- O banco é o juiz final do double-booking; a aplicação trata a
-- violação (23P01) como resposta de negócio, não como erro.
-- ─────────────────────────────────────────────────────────────

-- extensão necessária para EXCLUDE combinando igualdade (=) e ranges (&&)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) um profissional nunca tem dois agendamentos vivos sobrepostos
ALTER TABLE "Agendamento"
  ADD CONSTRAINT agendamento_profissional_sem_sobreposicao
  EXCLUDE USING gist (
    "empresaId"       WITH =,
    "profissionalId"  WITH =,
    tstzrange("inicio", "fim", '[)') WITH &&
  )
  WHERE (status IN ('agendado', 'confirmado', 'em_atendimento'));

-- 2) uma sala/recurso nunca tem duas reservas vivas sobrepostas
ALTER TABLE "Agendamento"
  ADD CONSTRAINT agendamento_recurso_sem_sobreposicao
  EXCLUDE USING gist (
    "empresaId"   WITH =,
    "recursoId"   WITH =,
    tstzrange("inicio", "fim", '[)') WITH &&
  )
  WHERE ("recursoId" IS NOT NULL
         AND status IN ('agendado', 'confirmado', 'em_atendimento'));

-- Busca do painel de clientes: índice PARCIAL (doc 02 §14.1) — só ativos
CREATE INDEX "Cliente_empresaId_nome_ativos_idx"
  ON "Cliente" ("empresaId", "nome")
  WHERE "deletedAt" IS NULL;
