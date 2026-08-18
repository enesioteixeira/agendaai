// O que este teste protege é a TRADUÇÃO entre a URL e o `FiltroInbox` de
// `@atende/db`. É o ponto onde um engano não aparece na tela: a inbox mostra uma
// lista plausível, com o recorte errado, e o operador conclui que a fila está
// vazia quando ela só está escondida atrás de um parâmetro.
//
// Não testa a ordenação por prazo nem o cálculo de `situacaoDoPrazo`: os dois são
// de `@atende/db` e de `@atende/core`, já cobertos lá. Repetir aqui daria
// impressão de cobertura e travaria a evolução do núcleo em asserções duplicadas.

import { describe, expect, it } from "vitest";

import {
  SEM_FILTROS,
  alternar,
  filtroDeConsulta,
  lerFiltros,
  montarQuery,
  quantosFiltrosFinos,
} from "./filtros";

const FILAS = [
  { id: "fila-televendas", nome: "Televendas" },
  { id: "fila-financeiro", nome: "Financeiro" },
];

const EU = "usuario-1";

describe("lerFiltros", () => {
  it("sem parâmetros, não filtra nada", () => {
    expect(lerFiltros({}, FILAS)).toEqual(SEM_FILTROS);
  });

  it("lê o recorte completo de um link compartilhado", () => {
    const filtros = lerFiltros(
      { de: "minhas", estado: "humano", fila: "fila-financeiro", prazo: "estourado" },
      FILAS,
    );
    expect(filtros).toEqual({
      de: "minhas",
      estado: "humano",
      fila: "fila-financeiro",
      prazo: "estourado",
    });
  });

  it("descarta a fila que não é deste tenant em vez de listar vazio", () => {
    // Id colado de outra empresa: a extension de tenancy já não acharia nada, e
    // a tela diria "nenhuma conversa" como se a fila estivesse tranquila.
    expect(lerFiltros({ fila: "fila-de-outra-empresa" }, FILAS).fila).toBeNull();
  });

  it("valor desconhecido desliga o filtro, não quebra a página", () => {
    const filtros = lerFiltros({ estado: "arquivada", prazo: "atrasadissima", de: "sei-la" }, FILAS);
    expect(filtros).toEqual(SEM_FILTROS);
  });

  it("parâmetro repetido fica com o primeiro", () => {
    expect(lerFiltros({ prazo: ["estourado", "cumprido"] }, FILAS).prazo).toBe("estourado");
  });
});

describe("filtroDeConsulta", () => {
  it('"todas" OMITE o atendente — passar null esconderia toda conversa assumida', () => {
    const consulta = filtroDeConsulta(lerFiltros({}, FILAS), EU);
    expect("atendenteUsuarioId" in consulta).toBe(false);
  });

  it('"minhas" filtra por quem está olhando', () => {
    const consulta = filtroDeConsulta(lerFiltros({ de: "minhas" }, FILAS), EU);
    expect(consulta.atendenteUsuarioId).toBe(EU);
  });

  it('"sem dono" filtra explicitamente por null', () => {
    const consulta = filtroDeConsulta(lerFiltros({ de: "sem_dono" }, FILAS), EU);
    expect(consulta.atendenteUsuarioId).toBeNull();
  });

  it("traduz fila, estado e prazo com os nomes que a camada de dados espera", () => {
    const consulta = filtroDeConsulta(
      lerFiltros({ fila: "fila-televendas", estado: "fila_humano", prazo: "perto_do_estouro" }, FILAS),
      EU,
    );
    expect(consulta).toEqual({
      filaId: "fila-televendas",
      estado: "fila_humano",
      situacaoPrazo: "perto_do_estouro",
    });
  });
});

describe("montarQuery e alternar", () => {
  it("não escreve o que está desligado", () => {
    expect(montarQuery(SEM_FILTROS)).toBe("");
  });

  it("ordem canônica: dois caminhos até o mesmo recorte dão a MESMA URL", () => {
    const a = alternar(alternar(SEM_FILTROS, "prazo", "estourado"), "fila", "fila-televendas");
    const b = alternar(alternar(SEM_FILTROS, "fila", "fila-televendas"), "prazo", "estourado");
    expect(montarQuery(a)).toBe(montarQuery(b));
    expect(montarQuery(a)).toBe("?fila=fila-televendas&prazo=estourado");
  });

  it("clicar de novo no valor ligado desliga o filtro", () => {
    const ligado = alternar(SEM_FILTROS, "prazo", "estourado");
    expect(alternar(ligado, "prazo", "estourado").prazo).toBeNull();
  });

  it("a URL volta a ser legível por lerFiltros — ida e volta sem perda", () => {
    const filtros = lerFiltros({ de: "minhas", fila: "fila-financeiro", prazo: "cumprido" }, FILAS);
    const params = Object.fromEntries(new URLSearchParams(montarQuery(filtros).slice(1)));
    expect(lerFiltros(params, FILAS)).toEqual(filtros);
  });

  it("conta só os filtros finos — o dono vive fora do detalhe", () => {
    const filtros = lerFiltros({ de: "minhas", fila: "fila-televendas" }, FILAS);
    expect(quantosFiltrosFinos(filtros)).toBe(1);
  });
});
