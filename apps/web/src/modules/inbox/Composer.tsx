"use client";

import { useActionState, useEffect, useRef } from "react";

import { Botao } from "@atende/ui";

import { responderConversaAction, type EstadoAtendimento } from "@/modules/atendimento/actions";

/**
 * O campo de resposta. Três decisões que não são estética:
 *
 * 1. **Enter envia, Shift+Enter quebra linha.** É o que todo aplicativo de
 *    mensagem faz, e o operador digita rápido demais para procurar o botão.
 * 2. **O foco volta ao campo após enviar.** Sem isso, a segunda mensagem exige
 *    um clique que ninguém deveria precisar dar.
 * 3. **O campo só é limpo quando a action confirma sucesso.** Limpar no submit
 *    perderia o texto se a ação falhasse — e a falha aqui é comum (conversa
 *    encerrada por outro atendente, sessão expirada).
 */
export function Composer({ conversaId }: { readonly conversaId: string }) {
  const [estado, action, enviando] = useActionState<EstadoAtendimento, FormData>(
    responderConversaAction,
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
      className="flex flex-col gap-2 border-t border-borda bg-superficie p-3"
    >
      <input type="hidden" name="conversaId" value={conversaId} />

      <div className="flex items-end gap-2">
        <textarea
          ref={campoRef}
          name="texto"
          required
          rows={2}
          maxLength={4000}
          placeholder="Escreva sua resposta…  (Enter envia, Shift+Enter quebra linha)"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              // `requestSubmit` e não `submit`: o segundo pula a validação
              // nativa e enviaria o formulário vazio.
              formRef.current?.requestSubmit();
            }
          }}
          className="min-h-[44px] flex-1 resize-y rounded-2 border border-borda bg-superficie-2 px-3 py-2 text-[13px] leading-snug text-texto outline-none placeholder:text-texto-fraco focus:border-acento"
        />
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar"}
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
