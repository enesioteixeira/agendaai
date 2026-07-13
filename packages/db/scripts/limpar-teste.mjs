// Limpa dados de teste E2E do banco (empresas/usuários com padrão de teste).
// Uso pontual: node scripts/limpar-teste.mjs   (carrega DATABASE_URL do .env)
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)?.[1];
if (!url) throw new Error("DATABASE_URL não encontrada no .env");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

// Empresas de teste: slug com "-teste-" ou "emp-a-"/"emp-b-"
const empresas = await prisma.empresa.findMany({
  where: { OR: [{ slug: { contains: "-teste-" } }, { slug: { startsWith: "emp-a-" } }, { slug: { startsWith: "emp-b-" } }] },
  select: { id: true, slug: true },
});
const ids = empresas.map((e) => e.id);

if (ids.length === 0) {
  console.log("Nenhuma empresa de teste encontrada.");
} else {
  // ordem de dependência (sem cascade no schema)
  await prisma.conviteUsuario.deleteMany({ where: { empresaId: { in: ids } } });
  await prisma.papelEscopo.deleteMany({ where: { empresaId: { in: ids } } });
  await prisma.vinculoUsuarioEmpresa.deleteMany({ where: { empresaId: { in: ids } } });
  await prisma.papel.deleteMany({ where: { empresaId: { in: ids } } });
  await prisma.unidade.deleteMany({ where: { empresaId: { in: ids } } });
  await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
  // usuários de teste (emails com padrão)
  await prisma.usuario.deleteMany({
    where: { OR: [{ email: { contains: "@teste.com" } }, { email: { endsWith: "@t.com" } }] },
  });
  console.log(`Removidas ${ids.length} empresas de teste (${empresas.map((e) => e.slug).join(", ")}) + usuários.`);
}

await prisma.$disconnect();
