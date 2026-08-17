// PONTE TEMPORÁRIA entre as telas legadas e os tokens do tema.
//
// POR QUE ELA EXISTE. Dez telas do painel foram escritas com CSS inline e cores
// cruas (`#333`, `#111`, `#ccc`). O tema **escuro é o padrão** do produto
// (`componentes/tema.ts`), e `--fundo` é `#070b1a` — então o rótulo de
// formulário `#333` e o botão primário `#111` ficavam praticamente invisíveis.
// O botão "Entrar" do login era um retângulo quase preto sobre navy quase preto.
//
// Trocar os literais por `var(--token)` conserta todas essas telas de uma vez,
// sem reescrever markup nenhum. A migração para o chassi (`@atende/ui`)
// acontece tela a tela em seguida — e cada tela migrada deixa de importar
// daqui.
//
// ESTE ARQUIVO É PARA MORRER. Quando o último importador sair, apague-o. O nome
// diz "ponte" por isso: nada novo deve nascer usando estes objetos; tela nova
// usa o chassi.
//
// Veio de `modules/agenda/estilos.ts` — mora aqui porque `agenda` é módulo
// CONGELADO (doc 12 §1.2), e telas vivas não devem depender de um módulo que
// não recebe evolução.

import type { CSSProperties } from "react";

export const lb: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 14,
  color: "var(--texto)",
};

export const ip: CSSProperties = {
  padding: "0.5rem 0.6rem",
  border: "1px solid var(--borda)",
  borderRadius: 6,
  fontSize: 15,
  // Sem estes dois, o input herda o branco do user-agent e vira uma faixa
  // clara no meio da tela escura, com o texto digitado ilegível.
  background: "var(--superficie)",
  color: "var(--texto)",
};

export const bt: CSSProperties = {
  padding: "0.55rem 0.9rem",
  background: "var(--acento)",
  color: "var(--acento-texto)",
  border: "none",
  borderRadius: 6,
  fontSize: 14,
  cursor: "pointer",
};

export const btSec: CSSProperties = {
  ...bt,
  background: "transparent",
  color: "var(--texto)",
  border: "1px solid var(--borda-forte)",
};

export const btPerigo: CSSProperties = {
  ...bt,
  background: "var(--perigo)",
};

export const tb: CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: 14,
};

/**
 * Tabela dentro do wrapper de rolagem.
 *
 * O `minWidth` é o que faz a tabela **rolar dentro da caixa** em vez de espremer
 * as colunas até ficarem ilegíveis no celular. Sem ele, `width: 100%` obedece a
 * um viewport de 390 px e transforma cada célula numa tira de duas letras.
 */
export const tbLarga: CSSProperties = { ...tb, minWidth: 560 };

export const th: CSSProperties = {
  textAlign: "left",
  borderBottom: "2px solid var(--borda-forte)",
  padding: "0.4rem 0.6rem",
  color: "var(--texto-suave)",
  whiteSpace: "nowrap",
};

export const td: CSSProperties = {
  borderBottom: "1px solid var(--borda)",
  padding: "0.45rem 0.6rem",
};

export const erroTxt: CSSProperties = { color: "var(--perigo)", margin: 0, fontSize: 14 };

export const suave: CSSProperties = { color: "var(--texto-suave)" };

export const cartao: CSSProperties = {
  border: "1px solid var(--borda)",
  borderRadius: 8,
  background: "var(--superficie)",
  padding: "1rem",
};

/** Wrapper de rolagem horizontal para tabela larga. Ver `tbLarga`. */
export const rolagemX: CSSProperties = {
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
};

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
