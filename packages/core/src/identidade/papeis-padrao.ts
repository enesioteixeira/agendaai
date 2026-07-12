// Papéis padrão criados no onboarding (doc 02 §12/§13). 4 papéis canônicos,
// com nome adaptado à vertical e escopos conforme a matriz. Admin pode
// editar/clonar depois — isto é ponto de partida, não camisa de força.

import type { VerticalEmpresa } from "./types";

export type PapelCanonico =
  | "administrador"
  | "gerente_unidade"
  | "recepcionista"
  | "profissional";

// Escopos de cada papel canônico — transcrição fiel da matriz do doc 02 §13.
export const ESCOPOS_POR_PAPEL: Record<PapelCanonico, string[]> = {
  administrador: [
    "agenda:ler", "agenda:criar", "agenda:cancelar", "agenda:configurar",
    "clientes:ler", "clientes:criar", "clientes:editar", "clientes:excluir",
    "atendimento:responder", "atendimento:assumir", "atendimento:configurar",
    "financeiro:cobrar", "financeiro:relatorios", "financeiro:configurar",
    "contratos:criar", "contratos:enviar", "contratos:cancelar",
    "fiscal:emitir", "loja:gerenciar",
    "config:usuarios", "config:canais", "config:empresa",
    "api:gerenciar", "lgpd:operar",
  ],
  gerente_unidade: [
    "agenda:ler", "agenda:criar", "agenda:cancelar", "agenda:configurar",
    "clientes:ler", "clientes:criar", "clientes:editar",
    "atendimento:responder", "atendimento:assumir", "atendimento:configurar",
    "financeiro:cobrar", "financeiro:relatorios",
    "contratos:criar", "contratos:enviar", "contratos:cancelar",
    "fiscal:emitir", "loja:gerenciar",
  ],
  recepcionista: [
    "agenda:ler", "agenda:criar", "agenda:cancelar",
    "clientes:ler", "clientes:criar", "clientes:editar",
    "atendimento:responder", "atendimento:assumir",
    "financeiro:cobrar",
    "contratos:enviar",
  ],
  profissional: [
    // "própria agenda" é filtro de aplicação (profissionalId do vínculo),
    // não escopo separado — doc 02 §13
    "agenda:ler", "agenda:criar",
    "clientes:ler",
  ],
};

// Nome exibido de cada papel por vertical (doc 02 §12).
const NOMES: Record<PapelCanonico, Partial<Record<VerticalEmpresa, string>> & { padrao: string }> = {
  administrador: {
    padrao: "Administrador",
    advocacia: "Sócio Administrador",
  },
  gerente_unidade: {
    padrao: "Gerente de Unidade",
    clinica_estetica: "Coordenador de Clínica",
    clinica_medica: "Coordenador de Clínica",
    advocacia: "Coordenador de Escritório",
  },
  recepcionista: {
    padrao: "Recepcionista",
    clinica_estetica: "Atendente",
    clinica_medica: "Atendente",
    advocacia: "Secretário Jurídico",
  },
  profissional: {
    padrao: "Profissional",
    clinica_estetica: "Profissional de Saúde",
    clinica_medica: "Profissional de Saúde",
    advocacia: "Advogado",
  },
};

export function nomePapel(papel: PapelCanonico, vertical: VerticalEmpresa): string {
  const mapa = NOMES[papel];
  return mapa[vertical] ?? mapa.padrao;
}

export interface PapelPadrao {
  canonico: PapelCanonico;
  nome: string;
  escopos: string[];
}

// Monta os 4 papéis padrão já com nome adaptado e escopos — consumido pelo
// serviço de onboarding para popular Papel + PapelEscopo.
export function papeisPadrao(vertical: VerticalEmpresa): PapelPadrao[] {
  const ordem: PapelCanonico[] = [
    "administrador",
    "gerente_unidade",
    "recepcionista",
    "profissional",
  ];
  return ordem.map((canonico) => ({
    canonico,
    nome: nomePapel(canonico, vertical),
    escopos: ESCOPOS_POR_PAPEL[canonico],
  }));
}
