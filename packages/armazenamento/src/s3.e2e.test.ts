import { describe, expect, it } from "vitest";

import { chaveDeMidia } from "@atende/core";

import { criarArmazenamentoS3, lerDoS3, TAMANHO_MAXIMO_BYTES, type ConfigS3 } from "./s3";

// Teste contra o MinIO do ambiente local (infra/docker-compose.yml).
//
// É e2e de propósito: assinatura SigV4 escrita à mão só se prova falando com um
// servidor S3 de verdade. Um teste com fetch simulado provaria que o código
// chama fetch, não que a assinatura confere — e assinatura errada falha só em
// produção, com 403 e nenhuma pista.
//
// Sem MinIO no ar, o arquivo é pulado em vez de falhar: o teste não pode
// quebrar a suíte de quem não subiu o ambiente.
const CONFIG: ConfigS3 = {
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  bucket: process.env.S3_BUCKET ?? "atende-ai-midia",
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "instant",
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "devlocal123",
  regiao: "us-east-1",
};

const disponivel = await fetch(`${CONFIG.endpoint}/minio/health/live`)
  .then((r) => r.ok)
  .catch(() => false);

describe.skipIf(!disponivel)("armazenamento S3 contra o MinIO local", () => {
  const armazenamento = criarArmazenamentoS3(CONFIG);
  const conteudo = new TextEncoder().encode("foto do pedido do varejista");

  it("guarda, lê de volta o mesmo conteúdo e remove", async () => {
    const chave = chaveDeMidia("emp_teste", "conv_teste", `msg_${Date.now()}`);

    const guardado = await armazenamento.guardar(chave, {
      conteudo,
      tipoMime: "image/jpeg",
    });
    expect(guardado.chave).toBe(chave);
    expect(guardado.tamanhoBytes).toBe(conteudo.byteLength);

    const lido = await lerDoS3(CONFIG, chave);
    expect(new TextDecoder().decode(lido.bytes)).toBe("foto do pedido do varejista");
    expect(lido.tipoMime).toBe("image/jpeg");

    await armazenamento.remover(chave);
    await expect(lerDoS3(CONFIG, chave)).rejects.toThrow();
  });

  // A chave tem barras, e é aí que a codificação de caminho do SigV4 quebra:
  // escapar a barra faria a assinatura deixar de casar com o caminho enviado.
  it("aceita chave com caminho, que é o formato real", async () => {
    const chave = `emp_teste/conversas/conv com espaço/msg_${Date.now()}`;
    await armazenamento.guardar(chave, { conteudo, tipoMime: "text/plain" });
    const lido = await lerDoS3(CONFIG, chave);
    expect(lido.bytes.byteLength).toBe(conteudo.byteLength);
    await armazenamento.remover(chave);
  });

  // Remoção é idempotente porque a retenção da LGPD roda de novo sobre o que já
  // apagou; falhar aí travaria o job em algo já resolvido.
  it("remover o que não existe não é erro", async () => {
    await expect(armazenamento.remover("emp_teste/nao/existe")).resolves.toBeUndefined();
  });

  it("recusa arquivo acima do teto antes de subir um byte", async () => {
    const gigante = new Uint8Array(TAMANHO_MAXIMO_BYTES + 1);
    await expect(
      armazenamento.guardar("emp_teste/gigante", { conteudo: gigante, tipoMime: "video/mp4" }),
    ).rejects.toThrow(/acima do teto/);
  });
});
