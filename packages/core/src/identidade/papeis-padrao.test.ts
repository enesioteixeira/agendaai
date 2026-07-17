import { describe, it, expect } from "vitest";
import { papeisPadrao, nomePapel, ESCOPOS_POR_PAPEL } from "./papeis-padrao";
import { CHAVES_ESCOPO } from "./escopos";

describe("papéis padrão por vertical", () => {
  it("cria 4 papéis canônicos", () => {
    expect(papeisPadrao("salao")).toHaveLength(4);
  });

  it("adapta nomes por vertical (doc 02 §12)", () => {
    expect(nomePapel("administrador", "salao")).toBe("Administrador");
    expect(nomePapel("administrador", "advocacia")).toBe("Sócio Administrador");
    expect(nomePapel("profissional", "advocacia")).toBe("Advogado");
    expect(nomePapel("recepcionista", "clinica_medica")).toBe("Atendente");
    expect(nomePapel("gerente_unidade", "advocacia")).toBe("Coordenador de Escritório");
  });

  it("admin tem todos os escopos do catálogo", () => {
    expect(new Set(ESCOPOS_POR_PAPEL.administrador)).toEqual(new Set(CHAVES_ESCOPO));
  });

  it("todo escopo de papel existe no catálogo (sem escopo fantasma)", () => {
    for (const escopos of Object.values(ESCOPOS_POR_PAPEL)) {
      for (const e of escopos) {
        expect(CHAVES_ESCOPO).toContain(e);
      }
    }
  });

  it("profissional não cobra, não cancela, não configura", () => {
    const p = ESCOPOS_POR_PAPEL.profissional;
    expect(p).not.toContain("financeiro:cobrar");
    expect(p).not.toContain("agenda:cancelar");
    expect(p).not.toContain("agenda:configurar");
  });

  it("só admin exclui cliente (fluxo LGPD) e configura empresa", () => {
    expect(ESCOPOS_POR_PAPEL.administrador).toContain("clientes:excluir");
    expect(ESCOPOS_POR_PAPEL.gerente_unidade).not.toContain("clientes:excluir");
    expect(ESCOPOS_POR_PAPEL.gerente_unidade).not.toContain("config:empresa");
    expect(ESCOPOS_POR_PAPEL.recepcionista).not.toContain("financeiro:relatorios");
  });
});
