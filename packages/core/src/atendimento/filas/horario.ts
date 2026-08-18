// Expediente da fila de atendimento (E1). O formato é o que o schema do banco
// já documenta em `Fila.horarioJson`:
//
//   { "fuso": "America/Sao_Paulo",
//     "dias": { "seg": [["08:00","12:00"], ["13:30","18:00"]], "sab": [["09:00","13:00"]] } }
//
// Chaves dos dias: dom, seg, ter, qua, qui, sex, sab. Dia ausente ou com lista
// vazia = fila fechada naquele dia. O fim "24:00" é aceito para o turno que
// termina na virada; turno que ATRAVESSA a meia-noite se escreve em duas faixas
// (22:00–24:00 no dia e 00:00–06:00 no seguinte), porque uma faixa com fim menor
// que o início é indistinguível de digitação trocada.
//
// Três decisões que valem o comentário:
//
// 1. Configuração malformada NÃO derruba o roteamento: `horarioJson` vem do
//    tenant e é campo livre no banco, então um JSON quebrado em UMA fila não
//    pode fazer a entrada de conversa de TODAS parar. Erro de parse cai no mesmo
//    comportamento de fila sem expediente configurado — 24 por 7.
// 2. Expediente com zero faixas na semana também vira 24 por 7, e não "fechada
//    para sempre": fechada para sempre faria toda conversa nascer sem prazo e em
//    silêncio, que é exatamente o defeito que o painel de prazo existe p/ evitar.
// 3. A conversão parede→UTC é local a este módulo em vez de reusar
//    `agenda/tempo.ts`: o módulo agenda está CONGELADO (CLAUDE.md) e não pode
//    entrar no caminho crítico do atendimento — mudança lá não pode quebrar o
//    prazo daqui.

import { z } from "zod";

/**
 * Fuso assumido quando o expediente é gravado sem `fuso`. Descartar a
 * configuração inteira por falta desse campo transformaria uma fila com horário
 * em uma fila 24 por 7 sem ninguém perceber; o produto é BR e a unidade padrão
 * é São Paulo, então o palpite erra menos que o descarte.
 */
export const FUSO_PADRAO = "America/Sao_Paulo";

/** Índice = dia da semana do JS (0=Dom..6=Sáb). */
const ORDEM_DOS_DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;

/** 7 dias + 1 para cobrir a virada de data no fuso do tenant. */
const HORIZONTE_DE_BUSCA_DIAS = 8;

/**
 * Teto de dias varridos ao consumir um prazo dentro do expediente. Prazo grande
 * demais para o expediente configurado (ex.: 3 000 min numa fila que abre 1 h por
 * semana) sai pelo caminho corrido — melhor um prazo frouxo do que um laço que
 * não termina no worker.
 */
const LIMITE_DE_DIAS = 370;

function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

function emMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h ?? 0) * 60 + Number(m ?? 0);
}

const horaDoExpediente = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Hora inválida (use HH:mm, de 00:00 a 24:00).");

export const intervaloExpedienteSchema = z
  .tuple([horaDoExpediente, horaDoExpediente])
  .refine((faixa) => emMinutos(faixa[1]) > emMinutos(faixa[0]), {
    message:
      "O fim do turno deve ser depois do início. Turno que vira o dia se escreve em duas faixas (22:00–24:00 e 00:00–06:00).",
  });

const faixasDoDiaSchema = z.array(intervaloExpedienteSchema).optional();

/** Contrato do `Fila.horarioJson` (regra inviolável 14: Zod em toda borda). */
export const horarioFilaSchema = z.object({
  fuso: z
    .string()
    .min(1)
    .refine(fusoValido, { message: "Fuso IANA desconhecido." })
    .default(FUSO_PADRAO),
  dias: z
    .object({
      dom: faixasDoDiaSchema,
      seg: faixasDoDiaSchema,
      ter: faixasDoDiaSchema,
      qua: faixasDoDiaSchema,
      qui: faixasDoDiaSchema,
      sex: faixasDoDiaSchema,
      sab: faixasDoDiaSchema,
    })
    .default({}),
});

export type HorarioFila = z.infer<typeof horarioFilaSchema>;
export type IntervaloExpediente = z.infer<typeof intervaloExpedienteSchema>;

/** Faixa já normalizada em minutos desde a meia-noite do fuso da fila. */
export interface FaixaDoDia {
  readonly inicioMin: number;
  readonly fimMin: number;
}

/** Expediente pronto para cálculo: faixas ordenadas e sem sobreposição, por dia. */
export interface Expediente {
  readonly fuso: string;
  /** Índice = dia da semana do JS (0=Dom..6=Sáb). */
  readonly dias: readonly (readonly FaixaDoDia[])[];
}

/** Ordena e funde faixas que se tocam — turno partido mal digitado não pode contar minuto duas vezes. */
function normalizarFaixas(faixas: readonly IntervaloExpediente[]): FaixaDoDia[] {
  const ordenadas = faixas
    .map((f) => ({ inicioMin: emMinutos(f[0]), fimMin: emMinutos(f[1]) }))
    .sort((a, b) => a.inicioMin - b.inicioMin);

  const fundidas: FaixaDoDia[] = [];
  for (const faixa of ordenadas) {
    const ultima = fundidas[fundidas.length - 1];
    if (ultima !== undefined && faixa.inicioMin <= ultima.fimMin) {
      fundidas[fundidas.length - 1] = {
        inicioMin: ultima.inicioMin,
        fimMin: Math.max(ultima.fimMin, faixa.fimMin),
      };
      continue;
    }
    fundidas.push(faixa);
  }
  return fundidas;
}

/**
 * Lê o `horarioJson` da fila. Devolve `null` para "sem expediente" — que aqui
 * significa 24 por 7 e cobre os três casos: campo ausente, JSON que não passa no
 * schema e expediente sem nenhuma faixa na semana.
 */
export function lerExpediente(horarioJson: unknown): Expediente | null {
  if (horarioJson === null || horarioJson === undefined) return null;

  const lido = horarioFilaSchema.safeParse(horarioJson);
  if (!lido.success) return null;

  const dias = ORDEM_DOS_DIAS.map((nome) => normalizarFaixas(lido.data.dias[nome] ?? []));
  if (dias.every((faixas) => faixas.length === 0)) return null;

  return { fuso: lido.data.fuso, dias };
}

interface ParedeNoFuso {
  /** "YYYY-MM-DD" no fuso da fila. */
  readonly data: string;
  /** Minutos desde a meia-noite no fuso da fila. */
  readonly minutos: number;
  readonly segundos: number;
}

function partesNoFuso(instante: Date, fuso: string): ParedeNoFuso {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);

  const valor = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((p) => p.type === tipo)?.value ?? "0";

  // "24" ainda aparece como hora da meia-noite em algumas versões de ICU.
  const hora = valor("hour") === "24" ? "0" : valor("hour");

  return {
    data: `${valor("year")}-${valor("month")}-${valor("day")}`,
    minutos: Number(hora) * 60 + Number(valor("minute")),
    segundos: Number(valor("second")),
  };
}

function offsetMs(instante: Date, fuso: string): number {
  const p = partesNoFuso(instante, fuso);
  const [ano, mes, dia] = p.data.split("-").map(Number);
  const comoUtc = Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1, 0, p.minutos, p.segundos);
  return comoUtc - instante.getTime();
}

/**
 * Instante UTC de uma hora de parede da fila. `minutos` pode passar de 1 440 —
 * a aritmética de `Date.UTC` vira o dia sozinha.
 */
function instanteDe(data: string, minutos: number, fuso: string): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  const base = Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1, 0, minutos);
  // Duas passadas estabilizam em torno de transição de horário de verão. O fuso
  // é do tenant: não dependa de o Brasil não ter DST desde 2019.
  let ts = base;
  for (let i = 0; i < 2; i++) ts = base - offsetMs(new Date(ts), fuso);
  return new Date(ts);
}

function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, (dia ?? 1) + dias)).toISOString().slice(0, 10);
}

function faixasDaData(expediente: Expediente, data: string): readonly FaixaDoDia[] {
  const [ano, mes, dia] = data.split("-").map(Number);
  const diaSemana = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1)).getUTCDay();
  return expediente.dias[diaSemana] ?? [];
}

/** A fila está aberta neste instante? Sem expediente configurado, está sempre. */
export function dentroDoExpediente(quando: Date, horario: unknown): boolean {
  const expediente = lerExpediente(horario);
  if (expediente === null) return true;

  const p = partesNoFuso(quando, expediente.fuso);
  return faixasDaData(expediente, p.data).some(
    (faixa) => p.minutos >= faixa.inicioMin && p.minutos < faixa.fimMin,
  );
}

function proximaAberturaDe(quando: Date, expediente: Expediente): Date | null {
  const p = partesNoFuso(quando, expediente.fuso);

  for (let d = 0; d < HORIZONTE_DE_BUSCA_DIAS; d++) {
    const data = somarDias(p.data, d);
    for (const faixa of faixasDaData(expediente, data)) {
      if (d === 0) {
        // Já aberta: a "próxima abertura" é agora, não a de amanhã.
        if (p.minutos >= faixa.inicioMin && p.minutos < faixa.fimMin) return quando;
        if (faixa.inicioMin <= p.minutos) continue; // faixa que já passou hoje
      }
      return instanteDe(data, faixa.inicioMin, expediente.fuso);
    }
  }
  return null; // inalcançável: lerExpediente garante ao menos uma faixa na semana
}

/**
 * Primeiro instante, a partir de `quando`, em que a fila está aberta — o próprio
 * `quando` se ela já estiver aberta.
 *
 * `null` significa "não há abertura a esperar": fila sem expediente, que atende
 * 24 por 7 e portanto nunca esteve fechada. É esse `null` que o chamador usa para
 * decidir se manda a `mensagemForaHorario`.
 */
export function proximaAberturaDoExpediente(quando: Date, horario: unknown): Date | null {
  const expediente = lerExpediente(horario);
  if (expediente === null) return null;
  return proximaAberturaDe(quando, expediente);
}

/**
 * Avança `minutos` a partir de `inicio` CONSUMINDO apenas tempo de expediente:
 * o relógio do prazo só corre com a fila aberta. Sem expediente configurado é
 * soma corrida.
 *
 * É o que impede as duas distorções de prazo: a mensagem da madrugada nascer
 * estourada, e a mensagem das 17h55 chegar quase vencida para quem abre o painel
 * às 8h.
 */
export function avancarNoExpediente(inicio: Date, minutos: number, horario: unknown): Date {
  const expediente = lerExpediente(horario);
  if (expediente === null || minutos <= 0) return new Date(inicio.getTime() + minutos * 60_000);

  const partida = proximaAberturaDe(inicio, expediente) ?? inicio;
  const p = partesNoFuso(partida, expediente.fuso);
  let restante = minutos;

  for (let d = 0; d < LIMITE_DE_DIAS; d++) {
    const data = somarDias(p.data, d);
    for (const faixa of faixasDaData(expediente, data)) {
      const comeco = d === 0 ? Math.max(faixa.inicioMin, p.minutos) : faixa.inicioMin;
      if (comeco >= faixa.fimMin) continue; // faixa já vencida no dia da partida
      const disponivel = faixa.fimMin - comeco;
      if (restante <= disponivel) return instanteDe(data, comeco + restante, expediente.fuso);
      restante -= disponivel;
    }
  }

  return new Date(partida.getTime() + minutos * 60_000);
}
