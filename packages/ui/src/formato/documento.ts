import { TRACO } from './numero'

/**
 * MÁSCARAS DOS DOCUMENTOS BRASILEIROS.
 *
 * Toda função aqui é FORMATAÇÃO, não validação: ela põe pontuação em cima do que
 * recebeu e nada mais. Quando o comprimento não bate com a máscara, o valor volta
 * limpo, sem máscara — jamais recortado. Um CNPJ digitado com 13 dígitos precisa
 * aparecer errado na tela para alguém corrigir; formatá-lo à força esconderia
 * exatamente o dado que está quebrado, e um documento truncado silenciosamente vira
 * nota rejeitada na SEFAZ.
 *
 * Dígito verificador é regra de negócio e vive na API, ao lado do cadastro. Repeti-la
 * aqui criaria duas verdades sobre o que é um CNPJ válido.
 */

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

function aplicar(digitos: string, grupos: readonly number[], separadores: readonly string[]): string {
  const partes: string[] = []
  let posicao = 0
  for (const tamanho of grupos) {
    partes.push(digitos.slice(posicao, posicao + tamanho))
    posicao += tamanho
  }
  return partes.reduce((texto, parte, indice) =>
    indice === 0 ? parte : `${texto}${separadores[indice - 1] ?? ''}${parte}`,
  '')
}

/** `12.345.678/0001-90`. */
export function formatarCnpj(valor: string | null | undefined): string {
  if (!valor) return TRACO
  const d = somenteDigitos(valor)
  if (d.length !== 14) return valor.trim()
  return aplicar(d, [2, 3, 3, 4, 2], ['.', '.', '/', '-'])
}

/** `390.555.666-04`. */
export function formatarCpf(valor: string | null | undefined): string {
  if (!valor) return TRACO
  const d = somenteDigitos(valor)
  if (d.length !== 11) return valor.trim()
  return aplicar(d, [3, 3, 3, 2], ['.', '.', '-'])
}

/**
 * Escolhe a máscara pelo comprimento — é o que a coluna "CNPJ/CPF" de um grid precisa,
 * já que parceiro pessoa física e jurídica dividem a mesma coluna.
 */
export function formatarDocumento(valor: string | null | undefined): string {
  if (!valor) return TRACO
  const d = somenteDigitos(valor)
  if (d.length === 14) return formatarCnpj(d)
  if (d.length === 11) return formatarCpf(d)
  return valor.trim()
}

/** `01310-100`. */
export function formatarCep(valor: string | null | undefined): string {
  if (!valor) return TRACO
  const d = somenteDigitos(valor)
  if (d.length !== 8) return valor.trim()
  return aplicar(d, [5, 3], ['-'])
}

/** `(11) 3456-7890`, `(11) 93456-7890`, `+55 (11) 93456-7890`. */
export function formatarTelefone(valor: string | null | undefined): string {
  if (!valor) return TRACO
  const d = somenteDigitos(valor)
  if (d.length === 12 || d.length === 13) {
    return `+${d.slice(0, 2)} ${formatarTelefone(d.slice(2))}`
  }
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`
  if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`
  return valor.trim()
}

/**
 * Chave de acesso da NF-e/NFC-e/CT-e: 44 dígitos em 11 grupos de 4.
 *
 * O agrupamento não é enfeite — é o que torna a conferência dígito a dígito possível
 * contra o DANFE, que imprime a chave exatamente assim.
 */
export function formatarChaveDeAcesso(valor: string | null | undefined): string {
  if (!valor) return TRACO
  const d = somenteDigitos(valor)
  if (d.length !== 44) return valor.trim()
  return (d.match(/.{4}/g) ?? []).join(' ')
}

/**
 * Inscrição estadual. Cada UF tem o seu formato — não existe máscara única —, e por
 * isso a tabela abaixo é EXPLÍCITA: UF sem verbete devolve os dígitos limpos, sem
 * máscara inventada. Uma máscara errada de IE é pior que nenhuma, porque parece
 * conferida.
 *
 * `ISENTO` atravessa como está: é valor legítimo no cadastro de parceiro não
 * contribuinte, e transformá-lo em dígitos apagaria a informação.
 */
const MASCARA_IE: Readonly<Record<string, { readonly grupos: readonly number[]; readonly separadores: readonly string[] }>> = {
  SP: { grupos: [3, 3, 3, 3], separadores: ['.', '.', '.'] },
  RJ: { grupos: [2, 3, 2, 1], separadores: ['.', '.', '-'] },
  MG: { grupos: [3, 3, 3, 4], separadores: ['.', '.', '/'] },
  PR: { grupos: [8, 2], separadores: ['-'] },
  RS: { grupos: [3, 7], separadores: ['/'] },
  SC: { grupos: [3, 3, 3], separadores: ['.', '.'] },
  BA: { grupos: [6, 2], separadores: ['-'] },
  GO: { grupos: [2, 3, 3, 1], separadores: ['.', '.', '-'] },
  PE: { grupos: [7, 2], separadores: ['-'] },
  DF: { grupos: [11, 2], separadores: ['-'] },
}

export function formatarInscricaoEstadual(
  valor: string | null | undefined,
  uf?: string | null,
): string {
  if (!valor) return TRACO
  const bruto = valor.trim()
  if (/^isent/i.test(bruto)) return 'ISENTO'

  const d = somenteDigitos(bruto)
  if (d === '') return bruto

  const mascara = uf ? MASCARA_IE[uf.trim().toUpperCase()] : undefined
  if (!mascara) return d

  const esperado = mascara.grupos.reduce((total, parte) => total + parte, 0)
  if (d.length !== esperado) return d

  return aplicar(d, mascara.grupos, mascara.separadores)
}

/** As UFs cujo formato de IE este módulo conhece. Serve para teste e para revisão. */
export const UFS_COM_MASCARA_DE_IE: readonly string[] = Object.keys(MASCARA_IE)
