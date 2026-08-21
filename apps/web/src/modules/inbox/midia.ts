// Leitura defensiva dos anexos de uma mensagem.
//
// `Mensagem.midia` é uma coluna JSON, e coluna JSON não tem tipo garantido: o
// que está lá foi escrito por uma versão do worker que pode não ser esta. Linha
// gravada antes do formato atual, ou por um conector futuro que erre o
// contrato, não pode derrubar a timeline inteira — a conversa vale mais que o
// anexo.
//
// Sem `zod` e sem importar valor de `@atende/core` de propósito: este módulo é
// lido por componente `"use client"`, e o barril do núcleo arrasta `node:crypto`
// para o bundle do navegador (o mesmo aviso está em `vocabulario.ts`).

export interface AnexoDaMensagem {
  readonly url: string;
  readonly mimeType: string;
  readonly tamanhoBytes: number;
  readonly nomeArquivo?: string | undefined;
}

/** Como a bolha deve apresentar o anexo. */
export type FormaDoAnexo = "imagem" | "audio" | "video" | "arquivo";

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * O que der para ler, ignorando o resto.
 *
 * `url` e `mimeType` são obrigatórios porque sem eles não há o que mostrar nem
 * como decidir a forma. O tamanho cai em zero — ele só enfeita o rótulo.
 */
export function lerAnexos(bruto: unknown): AnexoDaMensagem[] {
  if (!Array.isArray(bruto)) return [];

  const anexos: AnexoDaMensagem[] = [];
  for (const item of bruto) {
    if (!ehObjeto(item)) continue;
    const { url, mimeType, tamanhoBytes, nomeArquivo } = item;
    if (typeof url !== "string" || !url) continue;
    if (typeof mimeType !== "string" || !mimeType) continue;
    anexos.push({
      url,
      mimeType,
      tamanhoBytes: typeof tamanhoBytes === "number" && tamanhoBytes >= 0 ? tamanhoBytes : 0,
      nomeArquivo: typeof nomeArquivo === "string" && nomeArquivo ? nomeArquivo : undefined,
    });
  }
  return anexos;
}

/**
 * A forma vem do MIME, não do `tipo` da mensagem.
 *
 * São coisas diferentes: `tipo` é o que o canal disse que era, e o MIME é o que
 * o arquivo é. Quando discordam, quem manda na renderização é o arquivo.
 *
 * SVG cai em "arquivo" pela mesma razão que a rota o serve como anexo: é
 * documento com script, não figura.
 */
export function formaDoAnexo(mimeType: string): FormaDoAnexo {
  const tipo = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (tipo === "image/svg+xml") return "arquivo";
  if (tipo.startsWith("image/")) return "imagem";
  if (tipo.startsWith("audio/")) return "audio";
  if (tipo.startsWith("video/")) return "video";
  return "arquivo";
}

/** Tamanho legível. Serve ao rótulo do anexo, não a cálculo. */
export function formatarTamanho(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** O que escrever quando não há nome de arquivo — documento sem nome existe. */
export function rotuloDoAnexo(anexo: AnexoDaMensagem): string {
  const tamanho = formatarTamanho(anexo.tamanhoBytes);
  const nome = anexo.nomeArquivo ?? "Arquivo";
  return tamanho ? `${nome} · ${tamanho}` : nome;
}
