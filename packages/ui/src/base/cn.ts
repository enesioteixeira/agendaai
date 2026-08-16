/** Junta classes ignorando `false`, `null` e `undefined`. */
export function cn(...partes: Array<string | false | null | undefined>): string {
  return partes.filter(Boolean).join(' ')
}
