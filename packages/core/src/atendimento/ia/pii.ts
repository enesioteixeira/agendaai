// Mascaramento de PII antes de enviar conteudo a provedor de IA — puro, sem
// Prisma, sem SDK, sem rede. Port de `ev-tracker/src/lib/pii-core.ts`.
//
// Escopo deliberadamente estreito: CPF, CNPJ e cartao. Telefone e e-mail ficam
// FORA, e nao por esquecimento — no Instant Channel o telefone É a identidade do
// cliente (`IdentidadeCanal`), e as tools de catalogo e ERP buscam pessoa por
// documento ou contato. Mascarar os dois quebraria consulta legitima, e um
// agente que nao acha o cliente que acabou de escrever deixa de ser usado — aí o
// controle nao protege nada, porque ninguem passa mais por ele.
//
// ⚠️ A VALIDACAO DE DIGITO VERIFICADOR NAO E PRECIOSISMO. E o que separa esta
// mascara de um localizador de "onze digitos seguidos". Sem ela, numero de
// pedido, id do ERP e telefone com DDD virariam `***.***.***-**`, a resposta do
// modelo pioraria sem explicacao, e a primeira reacao de quem opera seria
// desligar o recurso.

export type TipoPii = "cpf" | "cnpj" | "cartao";

export interface ResultadoMascara {
  readonly texto: string;
  readonly achados: Record<TipoPii, number>;
}

const MASCARA_CPF = "***.***.***-**";
const MASCARA_CNPJ = "**.***.***/****-**";

// Fronteira: nao casar no MEIO de uma sequencia maior de digitos. Sem isto, um
// id de 20 digitos teria um "CPF" dentro dele.
const ANTES = "(?<![\\d.\\-/])";
const DEPOIS = "(?![\\d.\\-/])";

const RE_CNPJ = new RegExp(
  `${ANTES}(\\d{2})[.\\s]?(\\d{3})[.\\s]?(\\d{3})[/\\s]?(\\d{4})[-\\s]?(\\d{2})${DEPOIS}`,
  "g",
);
const RE_CPF = new RegExp(
  `${ANTES}(\\d{3})[.\\s]?(\\d{3})[.\\s]?(\\d{3})[-\\s]?(\\d{2})${DEPOIS}`,
  "g",
);
const RE_CARTAO = new RegExp(`${ANTES}(?:\\d[ -]?){12,18}\\d${DEPOIS}`, "g");

const soDigitos = (s: string): string => s.replace(/\D/g, "");
const todosIguais = (d: string): boolean => /^(\d)\1*$/.test(d);

/** DV mod-11 do CPF (dois digitos). */
export function cpfValido(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length !== 11 || todosIguais(d)) return false;
  for (const [tamanho, posicao] of [
    [9, 10],
    [10, 11],
  ] as const) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (posicao - i);
    const resto = (((soma * 10) % 11) % 10);
    if (resto !== Number(d[tamanho])) return false;
  }
  return true;
}

/** DV mod-11 do CNPJ (pesos 5..2 / 6..2). */
export function cnpjValido(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length !== 14 || todosIguais(d)) return false;
  const calcula = (tamanho: number): number => {
    let soma = 0;
    let peso = tamanho - 7;
    for (let i = 0; i < tamanho; i++) {
      soma += Number(d[i]) * peso;
      peso = peso - 1 < 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calcula(12) === Number(d[12]) && calcula(13) === Number(d[13]);
}

/** Luhn — checksum de cartao. */
export function luhnValido(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length < 12) return false;
  let soma = 0;
  let dobra = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (dobra) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
    dobra = !dobra;
  }
  return soma % 10 === 0;
}

/** Comprimentos e prefixos IIN que existem de verdade. */
const COMPRIMENTOS_CARTAO = new Set([13, 14, 15, 16, 19]);

function prefixoPlausivel(d: string): boolean {
  const p2 = Number(d.slice(0, 2));
  const p4 = Number(d.slice(0, 4));
  if (d.startsWith("4")) return true; // Visa
  if (p2 >= 51 && p2 <= 55) return true; // Mastercard
  if (p4 >= 2221 && p4 <= 2720) return true; // Mastercard (faixa nova)
  if (p2 === 34 || p2 === 37) return true; // Amex
  if (d.startsWith("6011") || p2 === 65) return true; // Discover
  if (p2 === 30 || p2 === 36 || p2 === 38) return true; // Diners
  if (p4 === 6062 || p2 === 50) return true; // Hipercard / Elo
  return false;
}

/**
 * Tripla condicao: Luhn + comprimento real + prefixo de bandeira.
 *
 * Luhn sozinho passa em ~10% de sequencias aleatorias — o suficiente para
 * mascarar id de sistema por acidente.
 */
export function cartaoValido(valor: string): boolean {
  const d = soDigitos(valor);
  if (!COMPRIMENTOS_CARTAO.has(d.length)) return false;
  if (todosIguais(d)) return false;
  if (!prefixoPlausivel(d)) return false;
  return luhnValido(d);
}

/**
 * Mascara CPF, CNPJ e cartao. Idempotente: passar duas vezes da o mesmo
 * resultado — necessario porque o texto transcrito de audio passa pela mascara
 * na transcricao E de novo no envio ao provedor de chat.
 */
export function mascararPii(texto: string): ResultadoMascara {
  const achados: Record<TipoPii, number> = { cpf: 0, cnpj: 0, cartao: 0 };
  if (!texto) return { texto, achados };

  // Ordem importa: CNPJ (14 digitos) antes de CPF (11) e de cartao, senao a
  // regex mais larga consome o que a mais especifica saberia identificar.
  let saida = texto.replace(RE_CNPJ, (bruto) => {
    if (!cnpjValido(bruto)) return bruto;
    achados.cnpj++;
    return MASCARA_CNPJ;
  });

  saida = saida.replace(RE_CPF, (bruto) => {
    if (!cpfValido(bruto)) return bruto;
    achados.cpf++;
    return MASCARA_CPF;
  });

  saida = saida.replace(RE_CARTAO, (bruto) => {
    if (!cartaoValido(bruto)) return bruto;
    achados.cartao++;
    // Ultimos 4 preservados: e o que permite alguem conferir de qual cartao se
    // fala sem que o numero saia daqui.
    const d = soDigitos(bruto);
    return `**** **** **** ${d.slice(-4)}`;
  });

  return { texto: saida, achados };
}

/** Total de ocorrencias — atalho para log e telemetria. */
export function totalAchados(achados: Record<TipoPii, number>): number {
  return achados.cpf + achados.cnpj + achados.cartao;
}

/**
 * Modo do portao de PII, por tenant.
 *
 * `observar` existe para medir antes de ligar: calcula e conta os achados, mas
 * manda o original. Sem essa janela, ligar a mascara direto em cima de um tenant
 * que fala CPF o dia inteiro seria descobrir o impacto pelo suporte.
 */
export type ModoPii = "off" | "observar" | "mascarar";

export interface EntradaParaModelo {
  readonly pergunta: string;
  readonly historico?: readonly { role: "user" | "assistant"; content: string }[];
  readonly instrucoesExtra?: string;
}

export interface SaidaDoPortao {
  readonly entrada: EntradaParaModelo;
  /** Quantos achados no total — para log. **Nunca** o valor encontrado. */
  readonly achados: number;
}

/**
 * O portao de PII na fronteira do provedor.
 *
 * Toca pergunta, historico e instrucoes extra. **Nao toca** o resultado de tool:
 * ali estao os ids que autorizam a execucao (id do pedido, do cliente, da
 * cobranca) e mascara-los quebraria a proposta que o modelo acabou de montar.
 */
export function aplicarPortaoPii(entrada: EntradaParaModelo, modo: ModoPii): SaidaDoPortao {
  if (modo === "off") return { entrada, achados: 0 };

  const pergunta = mascararPii(entrada.pergunta);
  const historico = (entrada.historico ?? []).map((m) => ({
    role: m.role,
    ...mascararPii(m.content),
  }));
  const extra = entrada.instrucoesExtra ? mascararPii(entrada.instrucoesExtra) : null;

  const achados =
    totalAchados(pergunta.achados) +
    historico.reduce((soma, m) => soma + totalAchados(m.achados), 0) +
    (extra ? totalAchados(extra.achados) : 0);

  // Em `observar` a contagem sai, o conteudo original segue: e a janela de
  // medicao antes de ligar a mascara de verdade.
  if (modo === "observar") return { entrada, achados };

  return {
    entrada: {
      pergunta: pergunta.texto,
      historico: historico.map((m) => ({ role: m.role, content: m.texto })),
      instrucoesExtra: extra?.texto,
    },
    achados,
  };
}
