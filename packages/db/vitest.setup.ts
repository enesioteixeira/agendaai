// Faz a camada de banco rodar por padrão quando o banco é local.
//
// O problema que isto resolve: os e2e deste pacote abrem com
// `describe.skipIf(!DATABASE_URL_TEST)`, e `pnpm test` na raiz não define essa
// variável. O resultado era a suíte inteira fechar VERDE tendo pulado a camada
// de banco — inclusive `isolamento.test.ts`, que é a prova da regra inviolável
// 1. Teste ausente é visível; teste pulado passa por cobertura.
//
// Por que exigir localhost em vez de simplesmente copiar `DATABASE_URL`: estes
// testes criam e apagam tenants. Contra um banco hospedado isso destrói dado
// real — já aconteceu neste projeto. O ambiente local é container descartável
// (`docker compose down -v` recria do zero), então ali o risco não existe e a
// segurança não custa cobertura.
//
// Apontar para outro destino continua possível, e continua sendo decisão
// explícita: `DATABASE_URL_TEST` definida à mão sempre vence.

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "host.docker.internal"]);

function ehLocal(url: string): boolean {
  try {
    return HOSTS_LOCAIS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

if (!process.env.DATABASE_URL_TEST) {
  const url = process.env.DATABASE_URL;
  if (url && ehLocal(url)) {
    process.env.DATABASE_URL_TEST = url;
  }
}
