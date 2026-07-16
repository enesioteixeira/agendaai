// Utilidades de tempo do domínio agenda. Regra inviolável 16: datas em UTC no
// banco, fuso da Unidade na apresentação. Estas funções são a ÚNICA ponte
// entre "horário de parede" (o que o usuário vê/digita) e o instante UTC.
// Implementação via Intl (nativo em Node e Workers — sem dependência).

/** Offset (ms) do fuso IANA no instante dado (ex.: America/Sao_Paulo → -3h). */
function offsetMs(instante: Date, fuso: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(instante).map((x) => [x.type, x.value]));
  const comoUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour === "24" ? 0 : p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return comoUtc - instante.getTime();
}

/**
 * Interpreta data ("YYYY-MM-DD") + hora ("HH:mm") como horário de parede no
 * fuso da unidade e devolve o instante UTC. Duas passadas para estabilizar em
 * torno de transições de DST (Brasil não tem DST desde 2019, mas o fuso é
 * configurável por unidade — não dependa disso).
 */
export function paraUtc(data: string, hora: string, fuso: string): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  const [h, m] = hora.split(":").map(Number);
  const base = Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1, h ?? 0, m ?? 0);
  let ts = base;
  for (let i = 0; i < 2; i++) ts = base - offsetMs(new Date(ts), fuso);
  return new Date(ts);
}

/** "HH:mm" do instante no fuso dado. */
export function horaNoFuso(instante: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instante);
}

/** "YYYY-MM-DD" do instante no fuso dado. */
export function dataNoFuso(instante: Date, fuso: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(instante);
}

export function adicionarMinutos(instante: Date, minutos: number): Date {
  return new Date(instante.getTime() + minutos * 60_000);
}

/** Soma dias a uma data "YYYY-MM-DD" (aritmética de calendário, sem fuso). */
export function adicionarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const d = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, (dia ?? 1) + dias));
  return d.toISOString().slice(0, 10);
}

/** Dia da semana (0=Dom..6=Sáb) de uma data "YYYY-MM-DD". */
export function diaDaSemana(data: string): number {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1)).getUTCDay();
}

/** Linhas da grade do painel: ["07:00","07:30",...,"20:30"]. */
export function linhasDaGrade(horaInicio = 7, horaFim = 21, passoMin = 30): string[] {
  const linhas: string[] = [];
  for (let min = horaInicio * 60; min < horaFim * 60; min += passoMin) {
    const h = String(Math.floor(min / 60)).padStart(2, "0");
    const m = String(min % 60).padStart(2, "0");
    linhas.push(`${h}:${m}`);
  }
  return linhas;
}
