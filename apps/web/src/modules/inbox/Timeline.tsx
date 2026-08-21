import { Icone } from "@atende/ui";

/**
 * A timeline da conversa. Cada bolha carrega três informações além do texto:
 * de que lado veio, QUEM a escreveu (cliente, atendente, fluxo, agente de IA,
 * sistema) e, nas de saída, o estado da entrega.
 *
 * A origem importa mais aqui do que numa central mono-canal: a partir da Fase C
 * a mesma conversa mistura fluxo determinístico, agente de IA e humano, e o
 * operador precisa saber quem disse o quê antes de assumir. Deixar isso implícito
 * na cor da bolha faria a resposta do bot parecer resposta do colega.
 *
 * AS NOTAS INTERNAS ENTRAM NA MESMA LINHA DO TEMPO, e não numa aba separada:
 * "o cliente xingou, o vendedor anotou o combinado, o cliente aceitou" só faz
 * sentido em ordem. O preço disso é que uma nota passa a conviver com as
 * mensagens — e é por isso que ela não é desenhada como bolha nenhuma: ocupa a
 * largura toda, tem moldura tracejada âmbar e diz por extenso quem a vê. Uma
 * nota que possa ser confundida com mensagem enviada é um vazamento esperando
 * acontecer, e a única defesa aqui é a nota não se parecer com nada mais na tela
 * (a mesma moldura aparece no campo onde ela foi escrita — ver `Composer.tsx`).
 */

const ENTREGA: Record<string, { readonly rotulo: string; readonly marca: string }> = {
  pendente: { rotulo: "Aguardando envio", marca: "🕓" },
  // Reservada por um worker e ainda sem confirmação. O ✓ é reservado para o que
  // saiu de verdade: mostrá-lo aqui foi exatamente o defeito que o estado novo
  // veio consertar.
  enviando: { rotulo: "Enviando", marca: "🕓" },
  enviada: { rotulo: "Enviada", marca: "✓" },
  entregue: { rotulo: "Entregue", marca: "✓✓" },
  lida: { rotulo: "Lida", marca: "✓✓" },
  falhou: { rotulo: "Falhou no envio", marca: "⚠" },
};

const ORIGEM: Record<string, string> = {
  cliente: "Cliente",
  humano: "Atendente",
  arvore: "Fluxo",
  ia: "Agente de IA",
  sistema: "Sistema",
};

export interface MensagemDaTimeline {
  readonly id: string;
  readonly direcao: string;
  readonly tipo: string;
  readonly origemMotor: string;
  readonly texto: string | null;
  readonly statusEntrega: string;
  readonly criadoEm: Date;
  readonly autor: { readonly nome: string } | null;
}

export interface NotaDaTimeline {
  readonly id: string;
  readonly texto: string;
  readonly autorNome: string;
  readonly criadoEm: Date;
}

/** Mensagens e notas numa lista só, em ordem cronológica. */
type ItemDaTimeline =
  | { readonly tipo: "mensagem"; readonly quando: Date; readonly mensagem: MensagemDaTimeline }
  | { readonly tipo: "nota"; readonly quando: Date; readonly nota: NotaDaTimeline };

function horaCurta(quando: Date): string {
  return quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function Timeline({
  mensagens,
  notas = [],
}: {
  readonly mensagens: readonly MensagemDaTimeline[];
  readonly notas?: readonly NotaDaTimeline[];
}) {
  if (mensagens.length === 0 && notas.length === 0) {
    return (
      <p className="m-auto max-w-[46ch] text-center text-[13px] text-texto-suave">
        Nenhuma mensagem nesta conversa ainda.
      </p>
    );
  }

  const itens: ItemDaTimeline[] = [
    ...mensagens.map((m) => ({ tipo: "mensagem" as const, quando: m.criadoEm, mensagem: m })),
    ...notas.map((n) => ({ tipo: "nota" as const, quando: n.criadoEm, nota: n })),
  ].sort((a, b) => a.quando.getTime() - b.quando.getTime());

  return (
    <ol className="flex flex-col gap-2">
      {itens.map((item) => {
        if (item.tipo === "nota") {
          const n = item.nota;
          return (
            <li
              key={`nota-${n.id}`}
              // Largura total e nunca alinhada a um dos lados: "encostada na
              // direita" é a gramática de mensagem enviada nesta tela, e é
              // exatamente a leitura que uma nota não pode sugerir.
              className="flex w-full flex-col gap-0.5 rounded-2 border border-dashed border-atencao bg-atencao-fraco px-3 py-2"
            >
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-atencao">
                <Icone nome="escudo" aria-hidden />
                Nota interna · o cliente não vê
              </span>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-snug">{n.texto}</p>
              <span className="text-right text-[10px] text-texto-fraco">
                {n.autorNome} · {horaCurta(n.criadoEm)}
              </span>
            </li>
          );
        }

        const m = item.mensagem;
        const saida = m.direcao === "saida";
        const entrega = ENTREGA[m.statusEntrega];
        const falhou = m.statusEntrega === "falhou";

        return (
          <li
            key={`msg-${m.id}`}
            className={`flex max-w-[78%] flex-col gap-0.5 rounded-2 px-3 py-2 ${
              saida
                ? "self-end bg-acento text-acento-texto"
                : "self-start border border-borda bg-superficie"
            } ${falhou ? "ring-1 ring-perigo" : ""}`}
          >
            <span
              className={`text-[10px] font-semibold uppercase tracking-[0.05em] ${
                saida ? "opacity-75" : "text-texto-fraco"
              }`}
            >
              {ORIGEM[m.origemMotor] ?? m.origemMotor}
              {m.autor ? ` · ${m.autor.nome}` : ""}
            </span>

            {m.texto ? (
              // `whitespace-pre-wrap`: o cliente escreve com quebras de linha, e
              // colapsá-las transforma uma lista de itens num parágrafo confuso.
              <p className="whitespace-pre-wrap break-words text-[13px] leading-snug">{m.texto}</p>
            ) : (
              <p className="inline-flex items-center gap-1 text-[13px] italic opacity-80">
                <Icone nome="caixa" aria-hidden />
                {/* Mídia chega na parte de mídia da Fase B; até lá, dizer o tipo
                    é mais honesto do que uma bolha vazia. */}
                Mensagem de {m.tipo}
              </p>
            )}

            <span
              className={`flex items-center justify-end gap-1 text-[10px] ${
                saida ? "opacity-75" : "text-texto-fraco"
              }`}
            >
              {horaCurta(m.criadoEm)}
              {saida && entrega ? (
                <span title={entrega.rotulo} aria-label={entrega.rotulo}>
                  {entrega.marca}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
