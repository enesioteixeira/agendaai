// O mês de competência do consumo. Puro: o instante entra por parâmetro.
//
// `UsoMensal` é único por `[empresaId, mesReferencia]`, então esta string é
// chave de banco, não rótulo de tela — é o que decide em qual linha o contador
// sobe. Errar o formato aqui não dá erro: dá uma segunda linha do mesmo mês, e
// duas linhas do mesmo mês são duas faturas.

/**
 * Mês de competência em UTC, no formato `AAAA-MM`.
 *
 * UTC e não o fuso da `Unidade` de propósito: o mesmo consumo tem que cair no
 * mesmo mês para a plataforma inteira. Com fuso local, um tenant em Fernando de
 * Noronha e outro no Acre fechariam meses diferentes, e a virada de mês viraria
 * uma janela de três horas em que a mesma conversa pertence a dois meses.
 * A regra 16 do CLAUDE.md já manda datas em UTC no banco — isto é a mesma regra
 * aplicada à agregação.
 */
export function mesReferencia(quando: Date): string {
  const instante = quando.getTime();
  if (!Number.isFinite(instante)) {
    // Data inválida viraria a string "NaN-NaN" e, com ela, uma linha de
    // `UsoMensal` que ninguém encontra e que nenhuma fatura fecha. Melhor
    // estourar onde o bug está.
    throw new Error("mesReferencia: data inválida");
  }

  const ano = quando.getUTCFullYear();
  const mes = String(quando.getUTCMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}`;
}

/**
 * O mês seguinte a um `AAAA-MM`.
 *
 * O excedente de IA é **cobrado no ciclo seguinte** (doc 06 §1) — é o que dá ao
 * tenant um mês para ver o consumo antes de ele virar dinheiro. Sem esta função
 * cada chamador faria a própria aritmética de virada de ano, e a de dezembro é
 * exatamente a que ninguém testa.
 */
export function mesSeguinte(mes: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    throw new Error(`mesSeguinte: mês de referência inválido: ${mes}`);
  }

  // Fatias em vez de grupos de captura: com `noUncheckedIndexedAccess` o grupo
  // vem `string | undefined` mesmo depois de a regex casar, e a checagem extra
  // só existiria para agradar o compilador.
  const ano = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));

  return numero === 12 ? `${ano + 1}-01` : `${ano}-${String(numero + 1).padStart(2, "0")}`;
}
