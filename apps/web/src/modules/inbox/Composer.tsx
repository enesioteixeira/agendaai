"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { Botao, Icone } from "@atende/ui";

import { responderConversaAction, type EstadoAtendimento } from "@/modules/atendimento/actions";

import { criarNotaInternaAction, type EstadoDaInbox } from "./actions";

/**
 * O rodapé da conversa: responder ao cliente ou escrever uma nota que o cliente
 * NÃO vê.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O PORQUÊ DO DESENHO: confundir nota com mensagem vaza para o cliente do nosso
 * cliente. Esse erro não tem desfazer — a mensagem já saiu pelo WhatsApp — e
 * custa a relação comercial de quem nos paga. Por isso a separação é feita em
 * QUATRO camadas, e nenhuma delas depende de o operador estar prestando atenção:
 *
 * 1. **Estrutural.** Cada modo é um `<form>` diferente com uma action diferente,
 *    e só UM está montado por vez. O texto de uma nota chega em
 *    `criarNotaInternaAction`, que grava em `NotaConversa` e não sabe enfileirar
 *    envio; não existe caminho de código que leve o conteúdo de um campo ao
 *    outro.
 * 2. **O texto não atravessa a troca de modo.** Trocar de aba descarta o
 *    rascunho, de propósito. Preservá-lo seria conveniente e seria exatamente o
 *    vetor do vazamento: escrever "cliente enrolando, não dar desconto" na aba
 *    de nota, trocar para responder e apertar Enter.
 * 3. **Visual, e no campo — não num rótulo distante.** No modo nota, a área
 *    inteira muda: fundo âmbar, borda tracejada, faixa com cadeado dizendo quem
 *    vê. Quem está digitando olha para o campo, não para a aba lá em cima.
 * 4. **O botão diz o que faz.** "Enviar ao cliente" contra "Salvar nota
 *    interna". Um botão "Enviar" nos dois modos apagaria as três camadas
 *    anteriores no último clique.
 *
 * A aba de nota continua disponível quando NÃO dá para responder (conversa
 * encerrada, ou de outro atendente): anotar o que aconteceu depois do
 * encerramento é justamente quando a nota vale mais, e nota nenhuma chega ao
 * cliente — não há o que proteger ali.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Sobre o campo de resposta, três decisões herdadas que não são estética:
 * Enter envia e Shift+Enter quebra linha (é o que todo aplicativo de mensagem
 * faz); o foco volta ao campo após enviar; e o campo só é limpo quando a action
 * CONFIRMA sucesso — limpar no submit perderia o texto numa falha, e falha aqui
 * é comum (conversa encerrada por outro atendente, sessão expirada).
 */

export interface RespostaRapidaDoComposer {
  readonly id: string;
  readonly atalho: string;
  readonly titulo: string;
  readonly texto: string;
}

type Modo = "resposta" | "nota";

/**
 * Normalizador de BUSCA do atalho — deliberadamente mais permissivo que
 * `normalizarAtalho` de `@atende/db`, que é a forma canônica gravada e casada
 * com o unique `(empresaId, atalho)`.
 *
 * Não reusamos aquela função porque ela mora num módulo que importa o Prisma
 * Client: importá-la aqui arrastaria o banco inteiro para o bundle do navegador.
 * A duplicação é contida por construção: aqui só se BUSCA, com `startsWith`, e
 * qualquer divergência futura entre as duas faria a paleta mostrar mais opções,
 * nunca menos — o pior caso é o atendente ver uma resposta a mais na lista.
 */
function normalizarBusca(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/**
 * O que está sendo digitado depois de uma barra, se houver.
 *
 * A barra só conta no COMEÇO do campo ou depois de espaço/quebra de linha:
 * "12/05" e "e/ou" não podem abrir a paleta no meio de uma frase. E o gatilho
 * olha apenas até o cursor, para editar o miolo de um texto já escrito não
 * reabrir a lista.
 */
function termoDoAtalho(texto: string, cursor: number): { termo: string; inicio: number } | null {
  const antes = texto.slice(0, cursor);
  const casou = /(^|[\s\n])\/([\p{L}\p{N}._-]*)$/u.exec(antes);
  if (!casou) return null;
  const termo = casou[2] ?? "";
  return { termo, inicio: cursor - termo.length - 1 };
}

export function Composer({
  conversaId,
  respostas,
  podeResponder,
  motivoDeNaoResponder,
}: {
  readonly conversaId: string;
  /** Respostas da fila da conversa + as gerais, já ordenadas por `listarRespostasRapidas`. */
  readonly respostas: readonly RespostaRapidaDoComposer[];
  readonly podeResponder: boolean;
  /** Frase que explica por que responder está fora — some quando `podeResponder`. */
  readonly motivoDeNaoResponder?: string;
}) {
  const [modo, definirModo] = useState<Modo>(podeResponder ? "resposta" : "nota");

  // Conversa assumida por outro atendente enquanto esta aba estava aberta: o
  // modo precisa cair para nota sozinho, senão o campo de resposta continuaria
  // aceitando texto que a action vai recusar.
  useEffect(() => {
    if (!podeResponder) definirModo("nota");
  }, [podeResponder]);

  return (
    <div className="border-t border-borda bg-superficie">
      <div
        role="tablist"
        aria-label="O que escrever"
        className="flex items-center gap-1 px-3 pt-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={modo === "resposta"}
          disabled={!podeResponder}
          onClick={() => definirModo("resposta")}
          className={`ie-chip ${modo === "resposta" ? "ie-chip--ativo" : ""} disabled:opacity-50`}
        >
          <Icone nome="conversa" aria-hidden />
          Responder
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={modo === "nota"}
          onClick={() => definirModo("nota")}
          className={`ie-chip ${modo === "nota" ? "ie-chip--ativo" : ""}`}
        >
          <Icone nome="escudo" aria-hidden />
          Nota interna
        </button>
      </div>

      {modo === "resposta" ? (
        <FormularioDeResposta conversaId={conversaId} respostas={respostas} />
      ) : (
        <FormularioDeNota conversaId={conversaId} />
      )}

      {!podeResponder && motivoDeNaoResponder ? (
        <p className="px-3 pb-2 text-[11px] text-texto-fraco">{motivoDeNaoResponder}</p>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Resposta ao cliente
// ─────────────────────────────────────────────────────────────

function FormularioDeResposta({
  conversaId,
  respostas,
}: {
  readonly conversaId: string;
  readonly respostas: readonly RespostaRapidaDoComposer[];
}) {
  const [estado, action, enviando] = useActionState<EstadoAtendimento, FormData>(
    responderConversaAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  // Campo CONTROLADO só neste modo, porque a paleta precisa reescrever o texto
  // no lugar do atalho. O modo nota segue com campo nativo — menos estado onde
  // não é preciso.
  const [texto, definirTexto] = useState("");
  const [busca, definirBusca] = useState<{ termo: string; inicio: number } | null>(null);
  const [destaque, definirDestaque] = useState(0);

  const sugestoes = useMemo(() => {
    if (busca === null) return [];
    const termo = normalizarBusca(busca.termo);
    return respostas
      .filter(
        (r) =>
          normalizarBusca(r.atalho).startsWith(termo) ||
          (termo.length > 0 && normalizarBusca(r.titulo).includes(termo)),
      )
      .slice(0, 8);
  }, [busca, respostas]);

  useEffect(() => {
    if (estado.ok) {
      definirTexto("");
      definirBusca(null);
      campoRef.current?.focus();
    }
  }, [estado]);

  useEffect(() => definirDestaque(0), [busca?.termo]);

  function aoDigitar(valor: string, cursor: number) {
    definirTexto(valor);
    definirBusca(respostas.length === 0 ? null : termoDoAtalho(valor, cursor));
  }

  /** Troca `/atalho` pelo texto da resposta e devolve o cursor para o fim dele. */
  function inserir(resposta: RespostaRapidaDoComposer) {
    if (busca === null) return;
    const fim = busca.inicio + busca.termo.length + 1;
    const novo = `${texto.slice(0, busca.inicio)}${resposta.texto}${texto.slice(fim)}`;
    const cursor = busca.inicio + resposta.texto.length;

    definirTexto(novo);
    definirBusca(null);
    // O `setSelectionRange` precisa acontecer depois do repintar, senão o React
    // reescreve o valor e joga o cursor para o fim do texto inteiro — que, numa
    // resposta longa inserida no meio da frase, é longe de onde a pessoa estava.
    requestAnimationFrame(() => {
      campoRef.current?.focus();
      campoRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLTextAreaElement>) {
    const aberta = busca !== null && sugestoes.length > 0;

    if (aberta) {
      if (evento.key === "ArrowDown") {
        evento.preventDefault();
        definirDestaque((i) => (i + 1) % sugestoes.length);
        return;
      }
      if (evento.key === "ArrowUp") {
        evento.preventDefault();
        definirDestaque((i) => (i - 1 + sugestoes.length) % sugestoes.length);
        return;
      }
      // Enter e Tab ESCOLHEM enquanto a paleta está aberta: com uma lista
      // visível sob o cursor, Enter que envia a mensagem crua "/pra" é o
      // resultado que ninguém espera.
      if (evento.key === "Enter" || evento.key === "Tab") {
        const escolhida = sugestoes[destaque];
        if (escolhida) {
          evento.preventDefault();
          inserir(escolhida);
          return;
        }
      }
      if (evento.key === "Escape") {
        evento.preventDefault();
        definirBusca(null);
        return;
      }
    }

    if (evento.key === "Enter" && !evento.shiftKey) {
      evento.preventDefault();
      // `requestSubmit` e não `submit`: o segundo pula a validação nativa e
      // enviaria o formulário vazio.
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} action={action} className="relative flex flex-col gap-2 p-3">
      <input type="hidden" name="conversaId" value={conversaId} />

      {busca !== null && sugestoes.length > 0 ? (
        <ul
          role="listbox"
          aria-label="Respostas rápidas"
          className="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-56 overflow-y-auto rounded-2 border border-borda bg-superficie shadow-2 barra-fina"
        >
          {sugestoes.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === destaque}
                // `onMouseDown` e não `onClick`: o clique tira o foco do campo
                // antes de disparar, e o blur fecharia a lista debaixo do dedo.
                onMouseDown={(e) => {
                  e.preventDefault();
                  inserir(r);
                }}
                className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left ${
                  i === destaque ? "bg-acento-fraco" : "hover:bg-superficie-2"
                }`}
              >
                <span className="text-[12px] font-semibold">
                  <span className="text-acento">/{r.atalho}</span> · {r.titulo}
                </span>
                <span className="line-clamp-2 text-[11px] text-texto-suave">{r.texto}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-end gap-2">
        <textarea
          ref={campoRef}
          name="texto"
          required
          rows={2}
          maxLength={4000}
          value={texto}
          onChange={(e) => aoDigitar(e.target.value, e.target.selectionStart)}
          onKeyDown={aoTeclar}
          onBlur={() => definirBusca(null)}
          placeholder={
            respostas.length > 0
              ? "Escreva sua resposta…  (/ abre as respostas rápidas · Enter envia)"
              : "Escreva sua resposta…  (Enter envia, Shift+Enter quebra linha)"
          }
          className="min-h-[44px] flex-1 resize-y rounded-2 border border-borda bg-superficie-2 px-3 py-2 text-[13px] leading-snug text-texto outline-none placeholder:text-texto-fraco focus:border-acento"
        />
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar ao cliente"}
        </Botao>
      </div>

      {estado.erro ? (
        <p role="alert" className="text-[12px] text-perigo">
          {estado.erro}
        </p>
      ) : null}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Nota interna
// ─────────────────────────────────────────────────────────────

function FormularioDeNota({ conversaId }: { readonly conversaId: string }) {
  const [estado, action, salvando] = useActionState<EstadoDaInbox, FormData>(
    criarNotaInternaAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (estado.ok) {
      formRef.current?.reset();
      campoRef.current?.focus();
    }
  }, [estado]);

  return (
    <form
      ref={formRef}
      action={action}
      // A moldura tracejada âmbar é a marca da nota e se repete na timeline
      // (`Timeline.tsx`): o que se escreve aqui vai aparecer lá com a mesma
      // cara, e é isso que fecha o circuito visual "isto é interno".
      className="m-3 flex flex-col gap-2 rounded-2 border border-dashed border-atencao bg-atencao-fraco p-3"
    >
      <input type="hidden" name="conversaId" value={conversaId} />

      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-atencao">
        <Icone nome="escudo" aria-hidden />
        Nota interna · o cliente não vê
      </p>

      <textarea
        ref={campoRef}
        name="nota"
        required
        rows={2}
        maxLength={4000}
        placeholder="Só o time lê. Ex.: cliente já reclamou disso em março, tratar com calma."
        // Enter NÃO salva aqui, e a diferença é intencional: nota é texto para
        // ser lido depois, escrito em várias linhas, e o dedo treinado no
        // "Enter envia" da conversa não pode ser o que decide quando ela fecha.
        className="min-h-[44px] resize-y rounded-2 border border-atencao bg-superficie px-3 py-2 text-[13px] leading-snug text-texto outline-none placeholder:text-texto-fraco focus:border-atencao"
      />

      <div className="flex items-center justify-end gap-2">
        {estado.erro ? (
          <p role="alert" className="mr-auto text-[12px] text-perigo">
            {estado.erro}
          </p>
        ) : null}
        <Botao type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar nota interna"}
        </Botao>
      </div>
    </form>
  );
}
