// Cálculo PURO de slots livres da booking (B4). Sem banco: recebe grade de
// trabalho, funcionamento, ocupados e bloqueios e devolve os horários "HH:mm"
// em que o serviço CABE inteiro. Quem decide conflito na escrita continua
// sendo a exclusion constraint — isto aqui é só a vitrine (doc 02 §3.1:
// "bloqueios filtram a LISTAGEM; o banco é o juiz final").

import { paraUtc, adicionarMinutos, diaDaSemana } from "./tempo";

export interface IntervaloDia {
  diaSemana: number; // 0=Dom..6=Sáb
  horaInicio: string; // "HH:mm"
  horaFim: string;
}

export interface Ocupacao {
  inicio: Date; // UTC
  fim: Date;
}

export interface EntradaSlots {
  data: string; // "YYYY-MM-DD" (no fuso da unidade)
  fuso: string; // IANA da unidade
  duracaoMin: number; // duração do serviço
  gradeTrabalho: IntervaloDia[]; // HorarioTrabalho do profissional
  funcionamento: IntervaloDia[]; // Unidade.horariosFuncionamento ([] = sem restrição)
  ocupados: Ocupacao[]; // agendamentos vivos do profissional no dia
  bloqueios: Ocupacao[]; // bloqueios que atingem o profissional/unidade no dia
  passoMin?: number; // granularidade dos slots (default 30)
  agora?: Date; // corte "não oferecer passado" (default: new Date())
}

function dentroDeAlgum(inicio: Date, fim: Date, janelas: Ocupacao[]): boolean {
  return janelas.some((j) => inicio >= j.inicio && fim <= j.fim);
}

function colideComAlgum(inicio: Date, fim: Date, janelas: Ocupacao[]): boolean {
  return janelas.some((j) => inicio < j.fim && fim > j.inicio);
}

/** Converte os intervalos "HH:mm" do dia em janelas UTC concretas da data. */
function janelasDoDia(data: string, fuso: string, intervalos: IntervaloDia[]): Ocupacao[] {
  const dia = diaDaSemana(data);
  return intervalos
    .filter((i) => i.diaSemana === dia)
    .map((i) => ({ inicio: paraUtc(data, i.horaInicio, fuso), fim: paraUtc(data, i.horaFim, fuso) }));
}

export function slotsLivres(e: EntradaSlots): string[] {
  const passo = e.passoMin ?? 30;
  const agora = e.agora ?? new Date();

  const trabalho = janelasDoDia(e.data, e.fuso, e.gradeTrabalho);
  if (trabalho.length === 0) return []; // profissional não trabalha nesse dia

  // funcionamento vazio = unidade sem restrição configurada (não bloqueia)
  const funcionamento = janelasDoDia(e.data, e.fuso, e.funcionamento);
  const exigeFuncionamento = e.funcionamento.length > 0;

  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: e.fuso,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const slots = new Set<string>();
  for (const janela of trabalho) {
    for (let t = janela.inicio.getTime(); t < janela.fim.getTime(); t += passo * 60_000) {
      const inicio = new Date(t);
      const fim = adicionarMinutos(inicio, e.duracaoMin);
      if (fim > janela.fim) continue; // serviço não cabe até o fim da grade
      if (inicio <= agora) continue; // nunca oferecer passado/imediato
      if (exigeFuncionamento && !dentroDeAlgum(inicio, fim, funcionamento)) continue;
      if (colideComAlgum(inicio, fim, e.ocupados)) continue;
      if (colideComAlgum(inicio, fim, e.bloqueios)) continue;
      slots.add(fmt.format(inicio));
    }
  }
  return [...slots].sort();
}
