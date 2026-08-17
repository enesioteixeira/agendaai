// empresaDaSessao — consulta pré-tenant que valida o tenant carregado no JWT.
//
// POR QUE PRÉ-TENANT. Ela responde justamente à pergunta "este tenant existe?",
// então não pode rodar dentro de `runWithTenant` do próprio tenant que está
// sendo verificado — seria circular. Mesma natureza do `resolverEmpresaPorSlug`
// (doc 02 §15.2): interna ao package, usa `prismaSemTenant` sem exportá-lo
// (doc 09 §3.2).
//
// POR QUE ELA EXISTE. O cookie de sessão dura 7 dias e o JWT não é revalidado a
// cada request. Sem esta checagem, uma sessão cujo tenant sumiu — empresa
// removida, banco restaurado de backup, ambiente recriado — atravessa o painel
// inteiro e só falha na primeira escrita, como violação de chave estrangeira
// crua na tela do usuário. Aconteceu de verdade em 2026-08-17:
//
//     Foreign key constraint violated on the constraint: `AgenteIA_empresaId_fkey`
//
// O usuário não tinha o que fazer com essa mensagem: a sessão parecia válida, o
// painel abria, e toda gravação falhava.
//
// ⚠️ Isto NÃO substitui a invalidação de sessão por troca de papel/vínculo, que
// segue pendente (ver `AGENTS.md` deste pacote). Cobre só a existência do
// tenant — que é o caso em que nada funciona.

import { prismaSemTenant } from "./unsafe";

export interface EmpresaDaSessao {
  id: string;
  nome: string;
  slug: string;
}

/** `null` quando a empresa não existe ou foi desativada — os dois casos em que a sessão deve cair. */
export async function empresaDaSessao(empresaId: string): Promise<EmpresaDaSessao | null> {
  if (!empresaId) return null;
  const empresa = await prismaSemTenant.empresa.findUnique({
    where: { id: empresaId },
    select: { id: true, nome: true, slug: true, ativa: true },
  });
  if (!empresa || !empresa.ativa) return null;
  return { id: empresa.id, nome: empresa.nome, slug: empresa.slug };
}
