"use client";

import { useActionState } from "react";

import { Botao } from "@atende/ui";

import { Campo, Entrada, ErroDoFormulario, Selecao } from "@/componentes/Campo";

import {
  criarEtiquetaAction,
  criarMotivoAction,
  type EstadoDeConfiguracao,
} from "./configuracao-actions";
import { CORES_DE_ETIQUETA } from "./vocabulario";

/**
 * Cadastro de motivo de encerramento.
 *
 * NÃO EXISTE EDIÇÃO, e a ausência é decisão. O nome do motivo é a legenda de
 * relatório de conversas encerradas: renomear "Sem estoque" para "Produto em
 * falta" reescreveria o passado inteiro — o relatório do mês fechado passaria a
 * dizer outra coisa sem que nada tenha mudado. Trocar de taxonomia se faz
 * arquivando o antigo e criando o novo, e é por isso que só existem esses dois
 * verbos.
 *
 * Criar um nome que já existe arquivado REATIVA o antigo em vez de duplicar (é o
 * que `criarMotivoEncerramento` faz), e o histórico continua apontando para a
 * mesma linha. A dica do campo diz isso: sem ela, o usuário que arquivou por
 * engano tenta recriar e não entende por que "voltou com o histórico".
 */
export function FormMotivo() {
  const [estado, action, enviando] = useActionState<EstadoDeConfiguracao, FormData>(
    criarMotivoAction,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Campo rotulo="Novo motivo" className="min-w-[15rem] flex-1">
          <Entrada
            name="nome"
            required
            minLength={2}
            maxLength={60}
            placeholder="Ex.: Pedido fechado"
          />
        </Campo>
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Salvando…" : "Adicionar"}
        </Botao>
      </div>
      <p className="text-[11px] text-texto-fraco">
        Recriar um motivo arquivado o traz de volta com o histórico.
      </p>
      <ErroDoFormulario>{estado.erro}</ErroDoFormulario>
    </form>
  );
}

/**
 * Cadastro de etiqueta.
 *
 * A cor é escolhida entre tokens do tema (ver `vocabulario.ts`) e não num
 * seletor de cor livre: a etiqueta aparece na inbox com o mesmo `Badge` desta
 * tela, e é isso que garante contraste legível nos dois temas sem ninguém
 * remedir nada.
 */
export function FormEtiqueta() {
  const [estado, action, enviando] = useActionState<EstadoDeConfiguracao, FormData>(
    criarEtiquetaAction,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Campo rotulo="Nova etiqueta" className="min-w-[13rem] flex-1">
          <Entrada
            name="nome"
            required
            minLength={2}
            maxLength={60}
            placeholder="Ex.: Cliente novo"
          />
        </Campo>
        <Campo rotulo="Cor" className="w-32">
          <Selecao name="cor" defaultValue="neutro">
            {CORES_DE_ETIQUETA.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Salvando…" : "Adicionar"}
        </Botao>
      </div>
      <p className="text-[11px] text-texto-fraco">
        Recriar uma etiqueta arquivada a traz de volta — inclusive nas conversas que já a tinham.
      </p>
      <ErroDoFormulario>{estado.erro}</ErroDoFormulario>
    </form>
  );
}
