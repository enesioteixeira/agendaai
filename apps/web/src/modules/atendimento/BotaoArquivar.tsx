"use client";

import { useState, useTransition } from "react";

import { Botao, Confirmar } from "@atende/ui";

import type { EstadoDeConfiguracao } from "./configuracao-actions";

/**
 * Arquivar um item do catálogo, com confirmação.
 *
 * POR QUE CONFIRMAR SE NÃO APAGA NADA. Arquivar é reversível no banco, mas não
 * pela interface: as funções expostas são `criar*` e `arquivar*`, e reativar só
 * acontece de lado — recriando o item com o mesmo nome, que ressuscita o
 * arquivado em vez de duplicar. Enquanto for assim, um clique errado num item de
 * catálogo tira uma opção do menu da inbox no meio do expediente, e um diálogo é
 * mais barato que descobrir isso pelo atendente.
 *
 * O rótulo do botão de confirmação repete o VERBO ("Arquivar fila"), nunca "OK":
 * é a regra do `Confirmar` do chassi, e o motivo é que numa tela onde o botão de
 * sair também se chama "Cancelar", o par "Cancelar / OK" produz a resposta
 * errada com frequência alta.
 *
 * A ação chega por prop — a mesma casca serve motivo, etiqueta, fila e resposta
 * rápida. Server Action é referência serializável, então passá-la de um
 * componente de servidor para este é o caminho previsto, não um contorno.
 */
export function BotaoArquivar({
  id,
  acao,
  titulo,
  explicacao,
  rotulo = "Arquivar",
  rotuloConfirmar,
}: {
  readonly id: string;
  readonly acao: (
    anterior: EstadoDeConfiguracao,
    formData: FormData,
  ) => Promise<EstadoDeConfiguracao>;
  readonly titulo: string;
  readonly explicacao: string;
  readonly rotulo?: string;
  readonly rotuloConfirmar?: string;
}) {
  const [aberto, definirAberto] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function confirmar() {
    const dados = new FormData();
    dados.set("id", id);
    definirErro(null);
    iniciar(async () => {
      const resultado = await acao({}, dados);
      if (resultado.erro) {
        // O diálogo FICA ABERTO no erro. Fechá-lo devolveria o usuário à lista
        // sem nenhuma pista de que nada aconteceu — e ele arquivaria de novo.
        definirErro(resultado.erro);
        return;
      }
      definirAberto(false);
    });
  }

  return (
    <>
      <Botao onClick={() => definirAberto(true)} disabled={pendente}>
        {rotulo}
      </Botao>

      {erro ? (
        <span role="alert" className="text-[11px] text-perigo">
          {erro}
        </span>
      ) : null}

      <Confirmar
        aberto={aberto}
        titulo={titulo}
        texto={
          <div className="flex flex-col gap-2">
            <p className="text-[13px] leading-relaxed text-texto-suave">{explicacao}</p>
            {erro ? (
              <p role="alert" className="text-[12px] text-perigo">
                {erro}
              </p>
            ) : null}
          </div>
        }
        rotuloConfirmar={rotuloConfirmar ?? rotulo}
        rotuloCancelar="Voltar"
        variante="perigo"
        ocupado={pendente}
        aoConfirmar={confirmar}
        aoCancelar={() => {
          definirErro(null);
          definirAberto(false);
        }}
      />
    </>
  );
}
