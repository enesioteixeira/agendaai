// Diz a cada worker onde os testes de banco escrevem.
//
// A criação do banco e as migrations acontecem uma vez só, no
// `vitest.global-setup.ts`. Aqui é apenas o cálculo da URL — barato e
// determinístico — porque `setupFiles` roda em processo separado por worker e
// a variável definida no global setup não atravessa essa fronteira.
//
// Precisa ser em `setupFiles`, e não dentro dos testes, porque o
// `describe.skipIf(!DATABASE_URL_TEST)` de cada e2e é avaliado na IMPORTAÇÃO
// do módulo — depois disso já é tarde.

import { urlDoBancoDeTeste } from "./vitest.banco-de-teste";

if (!process.env.DATABASE_URL_TEST) {
  const url = urlDoBancoDeTeste(process.env.DATABASE_URL);
  if (url) process.env.DATABASE_URL_TEST = url;
}
