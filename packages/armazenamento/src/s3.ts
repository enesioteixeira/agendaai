// Driver S3 do armazenamento de mídia.
//
// Um driver só para os dois destinos: MinIO local hoje, R2 quando houver
// cliente. Os dois falam S3, então a promoção do ambiente é trocar endereço e
// credencial — o código não sabe onde está.

import type { Armazenamento, ArquivoGuardado, ArquivoParaGuardar } from "@atende/core";

import { assinarRequisicao, codificarCaminho, type CredenciaisS3 } from "./assinatura";

export interface ConfigS3 extends CredenciaisS3 {
  /** Origem do serviço, sem bucket: http://localhost:9000 ou o endpoint do R2. */
  readonly endpoint: string;
  readonly bucket: string;
  /**
   * Base pública para leitura, quando existir (domínio do bucket no R2). Sem
   * ela, a leitura sai por rota do próprio produto, que é o caso local.
   */
  readonly baseDeLeitura?: string | undefined;
}

/**
 * Tamanho máximo aceito, em bytes.
 *
 * Existe teto porque o remetente é o cliente do nosso cliente: ninguém do nosso
 * lado escolhe o que chega. Sem limite, um vídeo de 300 MB entra na fila, ocupa
 * memória do worker que atende N tenants, e o custo de armazenamento é nosso.
 */
export const TAMANHO_MAXIMO_BYTES = 25 * 1024 * 1024;

export class ErroDeArmazenamento extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem);
    this.name = "ErroDeArmazenamento";
  }
}

export function criarArmazenamentoS3(config: ConfigS3): Armazenamento {
  return {
    async guardar(chave: string, arquivo: ArquivoParaGuardar): Promise<ArquivoGuardado> {
      if (arquivo.conteudo.byteLength > TAMANHO_MAXIMO_BYTES) {
        throw new ErroDeArmazenamento(
          `arquivo de ${arquivo.conteudo.byteLength} bytes acima do teto de ${TAMANHO_MAXIMO_BYTES}`,
        );
      }

      const req = await assinarRequisicao(
        {
          endpoint: config.endpoint,
          bucket: config.bucket,
          chave,
          metodo: "PUT",
          corpo: arquivo.conteudo,
          tipoMime: arquivo.tipoMime,
        },
        config,
      );

      const resposta = await fetch(req.url, {
        method: req.metodo,
        headers: req.cabecalhos,
        body: new Uint8Array(arquivo.conteudo),
      });
      if (!resposta.ok) {
        throw new ErroDeArmazenamento(
          `falha ao guardar ${chave}: ${resposta.status} ${await resposta.text()}`,
          resposta.status,
        );
      }

      return {
        chave,
        tipoMime: arquivo.tipoMime,
        tamanhoBytes: arquivo.conteudo.byteLength,
      };
    },

    async urlDeLeitura(chave: string, _validadeSegundos: number): Promise<string> {
      // Com base pública configurada (R2 com domínio), a leitura é direta.
      // Sem ela — o caso local — devolve o caminho servido pelo próprio produto,
      // que é onde a autorização por tenant acontece. Mídia de conversa é dado
      // pessoal de terceiro: link eterno em bucket aberto seria vazamento com URL.
      if (config.baseDeLeitura) {
        return `${config.baseDeLeitura.replace(/\/$/, "")}/${codificarCaminho(chave)}`;
      }
      return `/api/midia/${codificarCaminho(chave)}`;
    },

    async remover(chave: string): Promise<void> {
      const req = await assinarRequisicao(
        { endpoint: config.endpoint, bucket: config.bucket, chave, metodo: "DELETE" },
        config,
      );
      const resposta = await fetch(req.url, { method: req.metodo, headers: req.cabecalhos });
      // 404 é sucesso para remoção: a retenção da LGPD roda de novo sobre o que
      // já apagou, e falhar aí faria o job travar em algo já resolvido.
      if (!resposta.ok && resposta.status !== 404) {
        throw new ErroDeArmazenamento(
          `falha ao remover ${chave}: ${resposta.status}`,
          resposta.status,
        );
      }
    },
  };
}

/** Lê os bytes de volta — usado pela rota que serve a mídia ao painel. */
export async function lerDoS3(config: ConfigS3, chave: string): Promise<{ bytes: Uint8Array; tipoMime: string }> {
  const req = await assinarRequisicao(
    { endpoint: config.endpoint, bucket: config.bucket, chave, metodo: "GET" },
    config,
  );
  const resposta = await fetch(req.url, { method: req.metodo, headers: req.cabecalhos });
  if (!resposta.ok) {
    throw new ErroDeArmazenamento(`falha ao ler ${chave}: ${resposta.status}`, resposta.status);
  }
  return {
    bytes: new Uint8Array(await resposta.arrayBuffer()),
    tipoMime: resposta.headers.get("content-type") ?? "application/octet-stream",
  };
}

/**
 * Monta a configuração a partir do ambiente.
 *
 * Nomes iguais aos do padrão S3 para que a mesma variável sirva ao MinIO e ao
 * R2 sem tradução. Ausência de credencial devolve nulo em vez de estourar: o
 * produto tem de subir sem armazenamento configurado — a mídia degrada, o
 * atendimento não para.
 */
export function configS3DoAmbiente(env: Record<string, string | undefined>): ConfigS3 | null {
  const endpoint = env.S3_ENDPOINT;
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  const bucket = env.S3_BUCKET ?? "atende-ai-midia";
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    regiao: env.S3_REGIAO ?? "auto",
    baseDeLeitura: env.S3_BASE_LEITURA,
  };
}
