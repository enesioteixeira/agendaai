"use client";

import { useActionState, useState } from "react";

import { Botao } from "@atende/ui";

import {
  AreaDeTexto,
  Campo,
  Entrada,
  ErroDoFormulario,
  LinhaDeCampos,
  Selecao,
} from "@/componentes/Campo";

import { EditorDeExpediente } from "./EditorDeExpediente";
import {
  atualizarFilaAction,
  criarFilaAction,
  type EstadoDeConfiguracao,
} from "./configuracao-actions";
import {
  DISTRIBUICOES,
  PRAZO_MAXIMO_MIN,
  type ExpedienteDoFormulario,
} from "./vocabulario";

/** O que a tela precisa saber de uma fila para reabri-la em edição. */
export interface FilaEditavel {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly distribuicao: string;
  readonly prazoPrimeiraRespostaMin: number | null;
  readonly prazoResolucaoMin: number | null;
  readonly mensagemForaHorario: string | null;
  readonly expediente: ExpedienteDoFormulario | null;
}

/**
 * Cadastro e edição da fila — o mesmo formulário nos dois papéis.
 *
 * UM FORMULÁRIO SÓ porque os campos são os mesmos e a diferença é o `id` num
 * `<input type="hidden">`. Manter dois divergiria no primeiro campo novo: quem
 * acrescenta o campo lembra do formulário que está editando, não do outro — e o
 * sintoma seria uma configuração que só é possível criar, nunca corrigir.
 *
 * O prazo é pedido em MINUTOS porque é a unidade do banco
 * (`prazoPrimeiraRespostaMin`) e a que o roteador conta. Converter na tela
 * ("2h30") pareceria mais gentil e criaria um segundo formato para o mesmo
 * número — a leitura em horas aparece na lista, que é onde ela ajuda.
 */
export function FormFila({
  fila,
  aoSalvar,
}: {
  readonly fila?: FilaEditavel;
  /** Rótulo do botão quando o formulário está dentro de um bloco de edição. */
  readonly aoSalvar?: string;
}) {
  const editando = fila !== undefined;
  const [estado, action, enviando] = useActionState<EstadoDeConfiguracao, FormData>(
    editando ? atualizarFilaAction : criarFilaAction,
    {},
  );

  // Único estado do formulário, e existe pela EXPLICAÇÃO embaixo do campo:
  // "carteira" e "carga" são palavras que o gestor conhece do comercial com
  // outro significado, e uma dica que continuasse descrevendo a opção anterior
  // seria pior que dica nenhuma. Os demais campos seguem não controlados — sem
  // JavaScript, o formulário ainda envia.
  const [distribuicao, definirDistribuicao] = useState(fila?.distribuicao ?? "manual");

  return (
    <form action={action} className="flex flex-col gap-4">
      {editando ? <input type="hidden" name="id" value={fila.id} /> : null}

      <LinhaDeCampos>
        <Campo rotulo="Nome da fila">
          <Entrada
            name="nome"
            required
            minLength={2}
            maxLength={60}
            defaultValue={fila?.nome ?? ""}
            placeholder="Ex.: Televendas"
          />
        </Campo>

        <Campo
          rotulo="Como distribui"
          dica={DISTRIBUICOES.find((d) => d.valor === distribuicao)?.explicacao}
        >
          <Selecao
            name="distribuicao"
            value={distribuicao}
            onChange={(evento) => definirDistribuicao(evento.target.value)}
          >
            {DISTRIBUICOES.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
      </LinhaDeCampos>

      <Campo rotulo="Descrição" dica="Opcional — para quem for configurar isto depois de você.">
        <Entrada
          name="descricao"
          maxLength={200}
          defaultValue={fila?.descricao ?? ""}
          placeholder="Pedidos e cotação do time de vendas"
        />
      </Campo>

      <LinhaDeCampos>
        <Campo
          rotulo="Prazo de primeira resposta (min)"
          dica="Em branco = sem prazo. O painel avisa ANTES de estourar."
        >
          <Entrada
            type="number"
            inputMode="numeric"
            name="prazoPrimeiraRespostaMin"
            min={1}
            max={PRAZO_MAXIMO_MIN}
            step={1}
            defaultValue={fila?.prazoPrimeiraRespostaMin ?? ""}
            placeholder="15"
          />
        </Campo>

        <Campo rotulo="Prazo de resolução (min)" dica="Em branco = sem prazo.">
          <Entrada
            type="number"
            inputMode="numeric"
            name="prazoResolucaoMin"
            min={1}
            max={PRAZO_MAXIMO_MIN}
            step={1}
            defaultValue={fila?.prazoResolucaoMin ?? ""}
            placeholder="240"
          />
        </Campo>
      </LinhaDeCampos>

      <EditorDeExpediente expediente={fila?.expediente ?? null} />

      <Campo
        rotulo="Mensagem de fora do horário"
        dica="Enviada quando o cliente escreve com a fila fechada. Em branco, nada é enviado."
      >
        <AreaDeTexto
          name="mensagemForaHorario"
          rows={2}
          maxLength={500}
          defaultValue={fila?.mensagemForaHorario ?? ""}
          placeholder="Nosso atendimento é de segunda a sexta, das 8h às 18h. Respondemos assim que abrirmos."
        />
      </Campo>

      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Salvando…" : (aoSalvar ?? (editando ? "Salvar alterações" : "Criar fila"))}
        </Botao>
        {estado.ok ? <span className="text-[12px] text-sucesso">Salvo.</span> : null}
        <ErroDoFormulario>{estado.erro}</ErroDoFormulario>
      </div>
    </form>
  );
}
