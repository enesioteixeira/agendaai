// Onde os testes de banco escrevem — a regra, num lugar só.
//
// Os e2e deste pacote abrem com `describe.skipIf(!DATABASE_URL_TEST)`, e
// `pnpm test` não define essa variável: a suíte fechava VERDE tendo pulado a
// camada de banco inteira, incluindo `isolamento.test.ts`, que é a prova da
// regra inviolável 1. Teste ausente é visível; teste pulado passa por cobertura.
//
// Apontar os testes para o banco de desenvolvimento resolveria isso e criaria
// outro problema, já observado: cada rodada deixa dezenas de tenants e canais
// no banco que o painel e o worker usam, e o worker passa a abrir um socket
// Baileys para cada canal de teste. Daí o banco irmão `<banco>_test`, no mesmo
// container.
//
// Exigir `localhost` não é burocracia: estes testes criam e apagam tenants, e
// contra um banco hospedado isso destrói dado real — já aconteceu neste
// projeto. `DATABASE_URL_TEST` definida à mão continua vencendo.

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "host.docker.internal"]);

/**
 * A URL do banco de teste a partir da URL de desenvolvimento.
 *
 * `null` quando não dá para derivar com segurança — URL inválida ou destino que
 * não é local. Nesse caso os testes de banco voltam a ser pulados, e é
 * `exigencia.test.ts` que transforma esse silêncio em falha quando se pede.
 */
export function urlDoBancoDeTeste(url: string | undefined): string | null {
  if (!url) return null;

  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return null;
  }
  if (!HOSTS_LOCAIS.has(alvo.hostname)) return null;

  const nome = alvo.pathname.replace(/^\//, "");
  if (!nome) return null;
  if (nome.endsWith("_test")) return alvo.toString();

  alvo.pathname = `/${nome}_test`;
  return alvo.toString();
}

/** O nome do banco dentro da URL — usado para criá-lo se faltar. */
export function nomeDoBanco(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}
