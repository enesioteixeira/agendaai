// Armazenamento de mídia de conversa — a interface, sem implementação.
//
// Por que interface antes de driver: a mídia é baixada no worker (Node, onde o
// socket do WhatsApp vive) e servida pelo painel (Cloudflare Workers, onde
// existe binding nativo de bucket). São dois runtimes com formas diferentes de
// falar com o mesmo bucket, e o domínio não pode conhecer nenhuma das duas.
//
// Hoje o driver é S3 contra um MinIO local; em produção o mesmo driver aponta
// para o R2, que fala S3. A troca é de endereço e credencial, não de código —
// e é por isso que a mídia deixou de depender de uma permissão de nuvem para
// ser desenvolvida.

/** O que se sabe de um arquivo antes de guardá-lo. */
export interface ArquivoParaGuardar {
  /** Bytes crus. Quem baixou já validou tamanho e tipo. */
  readonly conteudo: Uint8Array;
  /** MIME declarado pela origem. Nunca confiar nele para decidir execução. */
  readonly tipoMime: string;
  /** Nome original, quando a origem informa. Só serve para exibição. */
  readonly nomeOriginal?: string | undefined;
}

/** Referência ao arquivo guardado. É isto que vai para o banco. */
export interface ArquivoGuardado {
  /** Caminho dentro do bucket, com o tenant no prefixo. */
  readonly chave: string;
  readonly tipoMime: string;
  readonly tamanhoBytes: number;
}

export interface Armazenamento {
  /**
   * Guarda o arquivo e devolve a referência.
   *
   * `chave` é construída por `chaveDeMidia` — nunca pelo chamador, para que o
   * prefixo de tenant não dependa de alguém lembrar.
   */
  guardar(chave: string, arquivo: ArquivoParaGuardar): Promise<ArquivoGuardado>;

  /**
   * Endereço temporário de leitura.
   *
   * Temporário e não público: mídia de conversa é dado pessoal de terceiro — a
   * pessoa que mandou a foto é cliente do nosso cliente, não nossa. Link
   * eterno em bucket público seria vazamento com URL.
   */
  urlDeLeitura(chave: string, validadeSegundos: number): Promise<string>;

  /** Remove o arquivo. Usado pela retenção da LGPD. */
  remover(chave: string): Promise<void>;
}

/**
 * Monta a chave do arquivo no bucket.
 *
 * O `empresaId` vem PRIMEIRO no caminho, e isso não é organização: é a
 * fronteira de isolamento do armazenamento. Uma política de acesso por prefixo
 * só existe se o prefixo for o tenant, e listar o bucket de um cliente nunca
 * pode devolver arquivo de outro.
 *
 * A extensão não entra na chave de propósito — quem decide como exibir é o
 * tipo MIME guardado no banco, e extensão em nome de arquivo vindo de fora é
 * vetor conhecido de confusão de tipo.
 */
export function chaveDeMidia(
  empresaId: string,
  conversaId: string,
  idMensagem: string,
): string {
  return `${empresaId}/conversas/${conversaId}/${idMensagem}`;
}

export type LeituraDeMidia =
  | { readonly ok: true; readonly chave: string }
  | { readonly ok: false; readonly motivo: "caminho-invalido" | "outro-tenant" };

/**
 * A chave pedida pode ser lida por este tenant?
 *
 * A resposta inteira está no prefixo — é para isto que `chaveDeMidia` põe o
 * tenant na frente. Mas prefixo se compara por SEGMENTO, nunca por
 * `startsWith`: "emp_1/" também é começo de "emp_10/...", e uma comparação
 * ingênua entregaria a mídia de um tenant vizinho a quem soubesse o formato do
 * id.
 *
 * Segmento vazio, "." e ".." são recusados porque a chave chega da URL: no S3
 * eles não navegam, mas normalizações no caminho até lá — proxy, runtime,
 * cliente HTTP — já transformaram isso em travessia em produtos de verdade.
 */
export function autorizarLeituraDeMidia(
  segmentos: readonly string[],
  empresaId: string,
): LeituraDeMidia {
  if (segmentos.length < 2) return { ok: false, motivo: "caminho-invalido" };
  for (const s of segmentos) {
    if (!s || s === "." || s === "..") return { ok: false, motivo: "caminho-invalido" };
  }
  if (segmentos[0] !== empresaId) return { ok: false, motivo: "outro-tenant" };
  return { ok: true, chave: segmentos.join("/") };
}

/**
 * O arquivo pode ser exibido no navegador, ou tem de ser baixado?
 *
 * Mídia de conversa é conteúdo que o cliente do nosso cliente enviou, servido
 * do NOSSO domínio, onde vive a sessão do painel. Um arquivo que o navegador
 * decida renderizar como HTML ou SVG executa script na nossa origem — é XSS
 * armazenado, com o anexo como vetor.
 *
 * Só imagem, áudio e vídeo são exibidos, e nem toda imagem: SVG é documento com
 * script, não figura. O resto desce como anexo.
 */
export function podeExibirNoNavegador(tipoMime: string): boolean {
  const tipo = tipoMime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (tipo === "image/svg+xml") return false;
  return tipo.startsWith("image/") || tipo.startsWith("audio/") || tipo.startsWith("video/");
}
