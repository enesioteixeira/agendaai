/**
 * Timeout de UMA requisição ao provedor.
 *
 * Fica abaixo do `ORCAMENTO_IA_MS` do turno (40 s, em `@atende/core`) de
 * propósito: o orçamento governa o turno inteiro, com suas várias iterações de
 * tool use, e este teto governa cada chamada. Sem o teto por requisição, uma
 * única chamada lenta consome o orçamento inteiro e o cliente recebe silêncio.
 */
export const TIMEOUT_IA_MS = 30_000;
