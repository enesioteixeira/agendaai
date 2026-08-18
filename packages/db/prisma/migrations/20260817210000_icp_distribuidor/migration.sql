-- O perfil de cliente do produto mudou, e o modelo de dados ainda descrevia o
-- perfil antigo. Esta migration é a parte do banco dessa virada.
--
-- Duas mudanças, e a primeira exige cuidado que o SQL gerado automaticamente
-- não tem: trocar os valores de um enum com `USING vertical::text::novo_tipo`
-- ESTOURA em qualquer linha que ainda carregue um valor removido. Como existem
-- tenants de desenvolvimento criados com `salao`, `clinica_medica` e afins, a
-- conversão precisa mapear explicitamente — o que sobrar vira `outro`.

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('fisica', 'juridica');

-- AlterEnum: VerticalEmpresa passa a nomear o cliente-alvo.
--
-- Os valores antigos (salao, barbearia, clinica_estetica, clinica_medica,
-- advocacia) eram, valor por valor, a lista de segmentos que o posicionamento
-- manda recusar — e um distribuidor só cabia como "outro". O enum novo inverte
-- isso: o cliente-alvo tem nome, e o resto é que vira "outro".
BEGIN;
CREATE TYPE "VerticalEmpresa_new" AS ENUM ('distribuidor_alimentos', 'distribuidor_geral', 'outro');

ALTER TABLE "Empresa" ALTER COLUMN "vertical" DROP DEFAULT;
ALTER TABLE "Empresa"
  ALTER COLUMN "vertical" TYPE "VerticalEmpresa_new"
  USING (
    CASE "vertical"::text
      WHEN 'distribuidor_alimentos' THEN 'distribuidor_alimentos'
      WHEN 'distribuidor_geral' THEN 'distribuidor_geral'
      -- Todo tenant do público antigo cai aqui. Não se perde informação de
      -- negócio: nenhum deles é cliente pagante, e a vertical antiga não
      -- descreve nada que o produto novo use.
      ELSE 'outro'
    END
  )::"VerticalEmpresa_new";

ALTER TYPE "VerticalEmpresa" RENAME TO "VerticalEmpresa_old";
ALTER TYPE "VerticalEmpresa_new" RENAME TO "VerticalEmpresa";
DROP TYPE "public"."VerticalEmpresa_old";
COMMIT;

-- AlterTable: o contato do nosso cliente é uma empresa.
--
-- `tipoPessoa` nasce `juridica` porque no atacado esse é o caso normal — quem
-- compra do distribuidor é um varejista com CNPJ. `vendedorId` é a carteira:
-- sem ela não há como distribuir conversa por carteira do vendedor, que é
-- requisito de MVP do atendimento (P1-ATD-003).
ALTER TABLE "Cliente" ADD COLUMN "cnpj" TEXT,
ADD COLUMN "razaoSocial" TEXT,
ADD COLUMN "tipoPessoa" "TipoPessoa" NOT NULL DEFAULT 'juridica',
ADD COLUMN "vendedorId" TEXT;

-- Cliente que já existia foi cadastrado como pessoa: quem tem CPF preenchido
-- continua sendo pessoa física. O default só vale para quem nasce daqui em
-- diante.
UPDATE "Cliente" SET "tipoPessoa" = 'fisica' WHERE "cpf" IS NOT NULL;

-- CreateIndex: Postgres não iguala NULLs em unique, então clientes sem CNPJ
-- coexistem — mesma lógica já usada no CPF.
CREATE UNIQUE INDEX "Cliente_empresaId_cnpj_key" ON "Cliente"("empresaId", "cnpj");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_vendedorId_fkey"
  FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
