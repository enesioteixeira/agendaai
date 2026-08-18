"use client";

import { useActionState, useEffect, useState } from "react";

import { Botao, Modal } from "@atende/ui";

import { Campo, Selecao } from "@/componentes/Campo";

import { encerrarComMotivoAction, type EstadoDaInbox } from "./actions";

/**
 * Encerrar a conversa. O botão NÃO encerra: ele abre a escolha do motivo.
 *
 * O motivo é o que transforma a inbox em relatório de demanda — sem ele, no mês
 * seguinte ninguém sabe por que as conversas terminaram, e o distribuidor não
 * consegue responder "quanto do meu atendimento é falta de estoque". Por isso
 * não existe caminho de encerramento sem motivo: nem aqui, nem na action (que
 * revalida o id contra o catálogo do tenant), nem em `encerrarConversa`, no
 * banco.
 *
 * NÃO HÁ MOTIVO PRÉ-SELECIONADO. Um `<select>` já apontando para o primeiro
 * item faria a maioria dos encerramentos herdarem o primeiro nome da lista, e o
 * relatório ficaria com uma barra gigante que não quer dizer nada. A opção
 * inicial é vazia e o `required` do HTML barra o envio; o servidor barra de novo,
 * porque `"use server"` publica um endpoint que não passa por este `<select>`.
 *
 * O diálogo é o `Modal` do chassi — Esc fecha, o foco entra e volta para o botão
 * que o abriu. No celular ele ocupa a tela e não disputa espaço com a conversa.
 */
export function EncerrarConversa({
  conversaId,
  motivos,
}: {
  readonly conversaId: string;
  /** Motivos ATIVOS do tenant — arquivado sai da lista de escolha, não do histórico. */
  readonly motivos: readonly { readonly id: string; readonly nome: string }[];
}) {
  const [aberto, definirAberto] = useState(false);
  const [estado, action, encerrando] = useActionState<EstadoDaInbox, FormData>(
    encerrarComMotivoAction,
    {},
  );

  // Fecha só quando o servidor confirma. Fechar no clique deixaria o operador
  // achar que encerrou uma conversa que outro atendente encerrou antes dele.
  useEffect(() => {
    if (estado.ok) definirAberto(false);
  }, [estado]);

  const semMotivos = motivos.length === 0;

  return (
    <>
      <button type="button" className="ie-botao" onClick={() => definirAberto(true)}>
        Encerrar
      </button>

      <Modal
        aberto={aberto}
        titulo="Encerrar conversa"
        subtitulo="O motivo aparece nos relatórios de atendimento."
        aoFechar={() => definirAberto(false)}
        travado={encerrando}
      >
        {semMotivos ? (
          // Empresa sem catálogo: dizer o que fazer, e onde. Um formulário com
          // um `<select>` vazio deixaria o operador clicando num botão que nunca
          // funciona, sem pista de que o problema é de configuração.
          <p className="text-[13px] text-texto-suave">
            Esta empresa ainda não cadastrou motivos de encerramento. Peça a quem administra o
            painel para criá-los em Configurar → Atendimento → Catálogos; sem motivo não é possível
            encerrar.
          </p>
        ) : (
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="conversaId" value={conversaId} />

            <Campo rotulo="Motivo do encerramento">
              <Selecao name="motivoEncerramentoId" required defaultValue="">
                <option value="" disabled>
                  Escolha o motivo…
                </option>
                {motivos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>

            {estado.erro ? (
              <p role="alert" className="text-[12px] text-perigo">
                {estado.erro}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Botao onClick={() => definirAberto(false)} disabled={encerrando}>
                Cancelar
              </Botao>
              <Botao type="submit" variante="primario" disabled={encerrando}>
                {encerrando ? "Encerrando…" : "Encerrar conversa"}
              </Botao>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
