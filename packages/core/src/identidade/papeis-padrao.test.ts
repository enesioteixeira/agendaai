import { describe, it, expect } from "vitest";
import { papeisPadrao, nomePapel, ESCOPOS_POR_PAPEL } from "./papeis-padrao";
import { CHAVES_ESCOPO } from "./escopos";

describe("papéis padrão por vertical", () => {
  it("cria 4 papéis canônicos", () => {
    expect(papeisPadrao("distribuidor_alimentos")).toHaveLength(4);
  });

  // O nome do papel é a primeira coisa que o cliente lê ao abrir Usuários. Para
  // um distribuidor, "Recepcionista" e "Profissional" descrevem outra empresa —
  // a dele tem televendas e vendedor.
  it("adapta nomes por vertical (doc 02 §12)", () => {
    expect(nomePapel("administrador", "distribuidor_alimentos")).toBe("Administrador");
    expect(nomePapel("gerente_unidade", "distribuidor_alimentos")).toBe("Gerente Comercial");
    expect(nomePapel("recepcionista", "distribuidor_geral")).toBe("Televendas");
    expect(nomePapel("profissional", "distribuidor_alimentos")).toBe("Vendedor");
  });

  it("cai no padrão quando a vertical não tem nome próprio", () => {
    expect(nomePapel("gerente_unidade", "outro")).toBe("Gerente de Unidade");
    expect(nomePapel("recepcionista", "outro")).toBe("Atendimento");
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
