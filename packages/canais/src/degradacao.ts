// Degradação automática (doc 05 §1.3): o motor produz sempre a forma mais
// rica; o CONECTOR degrada — o motor nunca se adapta ao canal.

import type { BotaoOutbound } from "./tipos.js";

export interface DegradacaoNumerada {
  texto: string;
  mapa: Record<string, string>; // "1" -> payload do botão (persistido na Conversa p/ o parser)
}

export function botoesParaListaNumerada(texto: string, botoes: BotaoOutbound[]): DegradacaoNumerada {
  const linhas = botoes.map((b, i) => `${i + 1} - ${b.rotulo}`);
  const mapa: Record<string, string> = {};
  botoes.forEach((b, i) => {
    mapa[String(i + 1)] = b.payload;
  });
  return {
    texto: `${texto}\n\n${linhas.join("\n")}\n\nResponda com o número da opção.`,
    mapa,
  };
}

// Parser tolerante da resposta numerada (doc 05 §4.2): aceita "1", "1.",
// "opção 1", "quero a 1" — mas recusa ambiguidade (dois números distintos).
export function parsearRespostaNumerada(
  resposta: string,
  mapa: Record<string, string>,
): string | null {
  const numeros = [...resposta.matchAll(/\d+/g)].map((m) => m[0]);
  const candidatos = [...new Set(numeros)].filter((n) => n in mapa);
  if (candidatos.length !== 1) return null;
  const escolhido = candidatos[0];
  return escolhido !== undefined ? (mapa[escolhido] ?? null) : null;
}
