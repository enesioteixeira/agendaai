// O armazenamento de mídia do worker, montado uma vez a partir do ambiente.
//
// Devolve `null` quando não há credencial, e isso é decisão de produto, não
// descuido: o atendimento não pode parar porque o bucket não está configurado.
// Sem armazenamento, a mensagem entra na inbox com o texto e o tipo — "Imagem"
// aparece na timeline sem o arquivo —, e o operador ainda responde. Estourar
// aqui derrubaria o inbound inteiro por causa de um anexo.

import { configS3DoAmbiente, criarArmazenamentoS3, TAMANHO_MAXIMO_BYTES } from "@atende/armazenamento";
import type { Armazenamento } from "@atende/core";

export { TAMANHO_MAXIMO_BYTES };

let memo: { armazenamento: Armazenamento | null } | null = null;

/**
 * O armazenamento, ou `null` se o ambiente não o configurou.
 *
 * Memoizado porque a assinatura das requisições é derivada da credencial e não
 * há estado de conexão: montar de novo a cada mensagem seria trabalho puro.
 */
export function armazenamentoDeMidia(): Armazenamento | null {
  if (memo) return memo.armazenamento;

  const config = configS3DoAmbiente(process.env);
  if (!config) {
    console.warn(
      "[midia] S3_ENDPOINT/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY ausentes — mídia de conversa não será guardada",
    );
    memo = { armazenamento: null };
    return null;
  }

  if (config.baseDeLeitura) {
    // Mídia de conversa é dado pessoal de terceiro: quem mandou a foto é
    // cliente do NOSSO cliente. Base pública de leitura transforma a chave num
    // link eterno que dispensa sessão — vazamento com URL. O caminho correto é
    // a rota do produto, onde a autorização por tenant acontece.
    console.warn(
      "[midia] S3_BASE_LEITURA está definida: a mídia passará a ser servida por link público, sem autorização por tenant",
    );
  }

  memo = { armazenamento: criarArmazenamentoS3(config) };
  return memo.armazenamento;
}

/** Só para teste: desfaz a memoização entre cenários. */
export function esquecerArmazenamento(): void {
  memo = null;
}
