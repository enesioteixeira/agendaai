import { Campo, Selecao } from "@/componentes/Campo";

import {
  DIAS_DA_SEMANA,
  FUSOS_DO_BRASIL,
  FUSO_SUGERIDO,
  TURNOS_POR_DIA,
  type ExpedienteDoFormulario,
} from "./vocabulario";

/**
 * Expediente da fila: fuso + faixas por dia.
 *
 * SEM JAVASCRIPT, DE PROPÓSITO. Não há botão "adicionar faixa" nem campo que
 * some ao desmarcar o dia: são dois turnos fixos por dia, sempre visíveis, e o
 * checkbox só decide se o dia entra no Json. O produto promete implantação em
 * menos de uma hora, muitas vezes num celular com conexão ruim — um formulário
 * que só funciona depois de o bundle carregar transforma "configurar a fila" em
 * "esperar a página".
 *
 * DOIS TURNOS COBREM O CASO REAL: manhã e tarde, com o almoço fechado no meio.
 * Turno que atravessa a meia-noite (22h→6h) se escreve como 22:00–24:00 num dia
 * e 00:00–06:00 no seguinte — é o que o `horarioFilaSchema` aceita, e o motivo
 * está lá: faixa com fim menor que o início é indistinguível de digitação
 * trocada. A dica embaixo diz isso ao usuário em vez de deixar o Zod recusar sem
 * explicação.
 *
 * Dia desmarcado NÃO limpa os horários digitados. Fechar a fila no sábado e
 * reabrir na semana seguinte é operação comum; apagar o que estava lá obrigaria
 * a redigitar, e um campo que se apaga sozinho é o que faz o usuário desconfiar
 * do formulário inteiro.
 */
export function EditorDeExpediente({
  expediente,
}: {
  readonly expediente: ExpedienteDoFormulario | null;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-2 border border-borda bg-superficie-2 p-3">
      <legend className="px-1 text-[12px] font-semibold text-texto-suave">
        Expediente da fila
      </legend>

      <p className="text-[11px] leading-relaxed text-texto-fraco">
        O prazo de primeira resposta só corre com a fila aberta — mensagem que chega de madrugada
        não nasce atrasada.{" "}
        <strong className="font-semibold text-texto-suave">
          Sem nenhum dia marcado, a fila atende 24 horas
        </strong>{" "}
        e a mensagem de fora do horário nunca é usada.
      </p>

      <Campo rotulo="Fuso horário" className="max-w-md">
        <Selecao name="fuso" defaultValue={expediente?.fuso ?? FUSO_SUGERIDO}>
          {FUSOS_DO_BRASIL.map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.rotulo}
            </option>
          ))}
        </Selecao>
      </Campo>

      <div className="flex flex-col gap-2">
        {DIAS_DA_SEMANA.map((dia) => {
          const faixas = expediente?.dias[dia.chave];
          const aberto = faixas !== undefined && faixas.length > 0;

          return (
            <div
              key={dia.chave}
              className="grid items-center gap-2 sm:grid-cols-[7.5rem_1fr] sm:gap-3"
            >
              <label className="flex items-center gap-2 text-[13px] text-texto">
                <input
                  type="checkbox"
                  name={`dia-${dia.chave}`}
                  defaultChecked={aberto}
                  className="h-4 w-4 accent-[var(--acento)]"
                />
                {dia.rotulo}
              </label>

              <div className="flex flex-wrap items-center gap-2">
                {TURNOS_POR_DIA.map((turno) => {
                  const faixa = faixas?.[turno - 1];
                  return (
                    <span key={turno} className="flex items-center gap-1">
                      <input
                        type="time"
                        aria-label={`${dia.rotulo} — início do ${turno}º turno`}
                        name={`${dia.chave}-${turno}-inicio`}
                        defaultValue={faixa?.[0] ?? ""}
                        className="rounded-2 border border-borda bg-superficie px-2 py-1 text-[13px] text-texto outline-none focus:border-acento"
                      />
                      <span aria-hidden className="text-[12px] text-texto-fraco">
                        às
                      </span>
                      <input
                        type="time"
                        aria-label={`${dia.rotulo} — fim do ${turno}º turno`}
                        name={`${dia.chave}-${turno}-fim`}
                        defaultValue={faixa?.[1] ?? ""}
                        className="rounded-2 border border-borda bg-superficie px-2 py-1 text-[13px] text-texto outline-none focus:border-acento"
                      />
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-texto-fraco">
        Dois turnos por dia dão conta do intervalo do almoço (08:00 às 12:00 e 13:30 às 18:00).
        Plantão que vira a noite se escreve em dois dias: 22:00 às 24:00 num, 00:00 às 06:00 no
        seguinte.
      </p>
    </fieldset>
  );
}
