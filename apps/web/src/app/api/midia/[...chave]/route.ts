// Serve a mídia de conversa ao painel.
//
// Por que a mídia passa por aqui, e não por link direto do bucket: o arquivo é
// dado pessoal de TERCEIRO — quem mandou a foto é cliente do nosso cliente,
// não nosso. Uma URL pública viveria para sempre, dispensaria sessão e vazaria
// por encaminhamento de link. Aqui a autorização acontece a cada requisição,
// contra o tenant da sessão.
//
// O caminho da URL é a própria chave no bucket (`chaveDeMidia`), cujo primeiro
// segmento é o tenant. A conferência é por segmento e mora no núcleo, testada:
// `autorizarLeituraDeMidia`.

import { NextResponse, type NextRequest } from "next/server";
import { autorizarLeituraDeMidia, podeExibirNoNavegador } from "@atende/core";
import { configS3DoAmbiente, lerDoS3 } from "@atende/armazenamento";

import { lerSessao } from "@/lib/sessao";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chave: string[] }> },
): Promise<NextResponse> {
  const sessao = await lerSessao();
  if (!sessao) return new NextResponse("não autenticado", { status: 401 });

  const { chave: segmentos } = await params;
  const veredicto = autorizarLeituraDeMidia(
    segmentos.map((s) => decodeURIComponent(s)),
    sessao.empresaId,
  );
  // 404 e não 403 de propósito: responder "proibido" confirmaria que a chave
  // existe, e a chave carrega o id da conversa e o da mensagem de outro tenant.
  if (!veredicto.ok) return new NextResponse("não encontrado", { status: 404 });

  const config = configS3DoAmbiente(process.env);
  if (!config) return new NextResponse("armazenamento não configurado", { status: 503 });

  try {
    const { bytes, tipoMime } = await lerDoS3(config, veredicto.chave);
    const exibir = podeExibirNoNavegador(tipoMime);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": tipoMime,
        // `nosniff` é o que impede o navegador de ignorar o Content-Type e
        // adivinhar pelo conteúdo — adivinhar HTML num anexo executa script na
        // nossa origem, onde mora o cookie do painel.
        "X-Content-Type-Options": "nosniff",
        // O que não é imagem, áudio ou vídeo desce como anexo em vez de ser
        // renderizado. Vale inclusive para SVG, que é documento com script.
        "Content-Disposition": exibir ? "inline" : "attachment",
        // `private`: a resposta depende da sessão e não pode ser guardada por
        // proxy compartilhado. O conteúdo em si é imutável — a chave carrega o
        // id da mensagem —, então o navegador do próprio operador pode reusar.
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    // Chave inexistente, bucket fora do ar, credencial errada. A distinção
    // interessa ao log, não a quem pediu — e o log já sai do driver.
    return new NextResponse("não encontrado", { status: 404 });
  }
}
