import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CANAIS, ESTADOS } from "../src/modules/inbox/vocabulario";

const SCHEMA = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "packages", "db", "prisma", "schema.prisma"),
  "utf8",
);

function valoresDoEnum(nome: string): string[] {
  const bloco = new RegExp(`enum ${nome} \\{([^}]*)\\}`).exec(SCHEMA)?.[1];
  if (!bloco) throw new Error(`enum ${nome} não encontrado no schema.prisma`);
  return bloco
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter(Boolean);
}

/**
 * CATRACA DE VOCABULÁRIO.
 *
 * `src/modules/inbox/vocabulario.ts` declara `TipoCanal` e `EstadoConversa` à
 * mão, em vez de importar os tipos gerados pelo Prisma — e isso é deliberado: o
 * client do Prisma não é importável num componente sem arrastar o runtime dele
 * para o bundle.
 *
 * O preço é que o TypeScript não sabe que essas listas precisam bater com o
 * schema. Acrescentar `sms` ao enum `TipoCanal` compilaria limpo, passaria no
 * build, e só apareceria em produção como uma conversa com o canal em branco e
 * um ícone que não existe. Este teste é o que cobra o pareamento.
 */
describe("vocabulário da inbox × schema.prisma", () => {
  it("descreve exatamente os canais do enum TipoCanal", () => {
    expect(Object.keys(CANAIS).sort()).toEqual(valoresDoEnum("TipoCanal").sort());
  });

  it("descreve exatamente os estados do enum EstadoConversa", () => {
    expect(Object.keys(ESTADOS).sort()).toEqual(valoresDoEnum("EstadoConversa").sort());
  });

  it("dá a todo canal um rótulo curto que cabe na lista", () => {
    for (const [tipo, aparencia] of Object.entries(CANAIS)) {
      expect(aparencia.curto.length, `${tipo} tem rótulo curto longo demais`).toBeLessThanOrEqual(
        12,
      );
    }
  });

  /**
   * Os tons carregam leitura operacional: `fila_humano` é o único estado que
   * pede ação de alguém agora, e por isso é o único em `atencao`. Trocar isso
   * por acaso — ao acrescentar um estado, por exemplo — apagaria da tela o
   * sinal que faz a fila ser atendida.
   */
  it("reserva o tom de atenção para quem está esperando atendimento", () => {
    const emAtencao = Object.entries(ESTADOS)
      .filter(([, v]) => v.tom === "atencao")
      .map(([k]) => k);
    expect(emAtencao).toEqual(["fila_humano"]);
  });
});
