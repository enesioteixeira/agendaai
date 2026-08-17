-- Fase 2 — a IA responde: onde mora a chave e quem atende cada canal.
--
-- ADITIVA E RETRO-COMPATÍVEL: o código em produção hoje ignora as duas coisas,
-- então esta migration pode (e deve) ser aplicada ANTES do código que a usa.
-- O build do Workers Builds não roda `migrate deploy` — a ordem é sempre
-- migration → conferir no banco → subir código.
--
-- `ADD VALUE` num enum é permitido dentro de transação no PG 12+ desde que o
-- valor novo não seja USADO na mesma transação. Aqui só se adiciona; o primeiro
-- uso vem do código, depois.

-- AlterEnum
-- 'ia' guarda a chave do provedor de modelo em `IntegracaoExterna`, em vez de
-- um `ConfigIAEmpresa` próprio: sem fallback para chave da plataforma (que é o
-- que obrigaria metering e teto por plano), aquele model seria uma tabela com
-- uma coluna útil. Aqui já vêm cifragem AES-256-GCM, `status`, `ultimoErro` e o
-- `@@unique([empresaId, categoria, tipo])`. Divergência do doc 12 §5.6,
-- registrada no doc 11.
ALTER TYPE "CategoriaIntegracao" ADD VALUE 'ia';

-- AlterTable
-- Quem atende primeiro neste canal. FK lógica, como `fluxoPadraoId`, para não
-- criar ciclo Canal↔AgenteIA. NULL = sem IA no canal — o desligado, sem
-- precisar de uma coluna booleana ao lado.
ALTER TABLE "Canal" ADD COLUMN     "agentePadraoId" TEXT;
