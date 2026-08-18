// Assinatura AWS SigV4 — o suficiente para falar S3, e nada além.
//
// Por que à mão, e não com o SDK da AWS: o driver precisa rodar nos DOIS
// runtimes do produto. No worker é Node; no painel é o runtime da borda, onde o
// SDK arrasta megabytes e depende de APIs de Node que não existem lá. O que
// falta para conversar com um bucket S3 é assinar a requisição, e assinar é
// hash com HMAC — que a Web Crypto tem nos dois lugares.
//
// O resultado é um driver que funciona igual contra o MinIO local e contra o
// R2 em produção, sem dependência nova e sem `if (estamos no Workers)`.
//
// Escopo deliberadamente pequeno: assinatura no cabeçalho (não presigned de
// POST de formulário), payload já em memória, sem streaming e sem multipart.
// Mídia de conversa é arquivo pequeno; quando deixar de ser, a decisão volta.

const CODIFICADOR = new TextEncoder();

async function hmac(chave: ArrayBuffer | Uint8Array, mensagem: string): Promise<ArrayBuffer> {
  const material = chave instanceof Uint8Array ? new Uint8Array(chave) : new Uint8Array(chave);
  const importada = await crypto.subtle.importKey(
    "raw",
    material,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", importada, CODIFICADOR.encode(mensagem));
}

function paraHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(conteudo: Uint8Array | string): Promise<string> {
  const bytes = typeof conteudo === "string" ? CODIFICADOR.encode(conteudo) : conteudo;
  // Uint8Array vira BufferSource copiando para um ArrayBuffer próprio: o buffer
  // do Node pode ser um pedaço de um pool maior, e passá-lo direto assinaria
  // bytes de outra pessoa.
  const copia = new Uint8Array(bytes);
  return paraHex(await crypto.subtle.digest("SHA-256", copia));
}

/** `20260817T221500Z` e `20260817` — os dois formatos que o SigV4 pede. */
function carimbos(agora: Date): { longo: string; curto: string } {
  const longo = agora.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { longo, curto: longo.slice(0, 8) };
}

/**
 * Codificação de caminho da AWS: cada segmento é percent-encoded, mas a barra
 * que separa segmentos NÃO. `encodeURIComponent` sozinho escaparia as barras e
 * a assinatura deixaria de casar com o caminho enviado — erro clássico, e que
 * só aparece com chave que tem barra, que é justamente o nosso caso
 * (`empresa/conversas/id`).
 */
export function codificarCaminho(caminho: string): string {
  return caminho
    .split("/")
    .map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

export interface CredenciaisS3 {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly regiao: string;
}

export interface RequisicaoAssinada {
  readonly url: string;
  readonly metodo: string;
  readonly cabecalhos: Record<string, string>;
}

/**
 * Assina uma requisição S3 no cabeçalho `Authorization`.
 *
 * `endpoint` é a origem do serviço (http://localhost:9000 no MinIO,
 * https://<conta>.r2.cloudflarestorage.com no R2) e o bucket entra no caminho —
 * estilo *path*, e não *virtual host*. É o que o MinIO local aceita sem DNS
 * curinga, e o R2 também aceita.
 */
export async function assinarRequisicao(
  entrada: {
    readonly endpoint: string;
    readonly bucket: string;
    readonly chave: string;
    readonly metodo: "GET" | "PUT" | "DELETE";
    readonly corpo?: Uint8Array | undefined;
    readonly tipoMime?: string | undefined;
    readonly agora?: Date | undefined;
  },
  credenciais: CredenciaisS3,
): Promise<RequisicaoAssinada> {
  const agora = entrada.agora ?? new Date();
  const { longo, curto } = carimbos(agora);
  const url = new URL(entrada.endpoint);
  const caminho = `/${entrada.bucket}/${codificarCaminho(entrada.chave)}`;
  const hashDoCorpo = await sha256Hex(entrada.corpo ?? "");

  const cabecalhos: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": hashDoCorpo,
    "x-amz-date": longo,
  };
  if (entrada.tipoMime) cabecalhos["content-type"] = entrada.tipoMime;

  const nomesOrdenados = Object.keys(cabecalhos).sort();
  const cabecalhosCanonicos = nomesOrdenados.map((n) => `${n}:${cabecalhos[n]}\n`).join("");
  const assinados = nomesOrdenados.join(";");

  const requisicaoCanonica = [
    entrada.metodo,
    caminho,
    "", // sem query
    cabecalhosCanonicos,
    assinados,
    hashDoCorpo,
  ].join("\n");

  const escopo = `${curto}/${credenciais.regiao}/s3/aws4_request`;
  const paraAssinar = [
    "AWS4-HMAC-SHA256",
    longo,
    escopo,
    await sha256Hex(requisicaoCanonica),
  ].join("\n");

  const kData = await hmac(CODIFICADOR.encode(`AWS4${credenciais.secretAccessKey}`), curto);
  const kRegion = await hmac(kData, credenciais.regiao);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const assinatura = paraHex(await hmac(kSigning, paraAssinar));

  return {
    url: `${url.origin}${caminho}`,
    metodo: entrada.metodo,
    cabecalhos: {
      ...cabecalhos,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${credenciais.accessKeyId}/${escopo}, ` +
        `SignedHeaders=${assinados}, Signature=${assinatura}`,
    },
  };
}
