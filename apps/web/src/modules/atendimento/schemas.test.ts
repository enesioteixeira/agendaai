// O que este teste protege é a TRADUÇÃO entre o formulário e o banco: campos de
// HTML (strings, checkbox ausente, hora em dois inputs) viram o `horarioJson` que
// o roteador do worker lê, e voltam. É o ponto onde um engano não aparece na
// tela — a fila salva "com sucesso" e passa a prometer prazo de madrugada.
//
// Não testa o cálculo de expediente nem o de prazo: isso é do núcleo, já coberto
// em `packages/core/src/atendimento/filas`. Repetir aqui daria a impressão de
// cobertura e travaria a evolução do core em cima de asserções duplicadas.

import { describe, expect, it } from "vitest";

import {
  filaFormSchema,
  lerHorarioParaFormulario,
  montarHorarioDoFormulario,
  respostaRapidaFormSchema,
} from "./schemas";

/** Simula o `FormData` de um formulário: campo ausente é `null`, como no HTML. */
function formulario(campos: Record<string, string>): (campo: string) => string | null {
  return (campo) => campos[campo] ?? null;
}

function primeiraMensagem(resultado: { success: boolean; error?: { issues: { message: string }[] } }) {
  return resultado.error?.issues[0]?.message ?? "";
}

describe("expediente: formulário → horarioJson", () => {
  it("monta só os dias marcados, com os dois turnos", () => {
    const horario = montarHorarioDoFormulario(
      formulario({
        fuso: "America/Sao_Paulo",
        "dia-seg": "on",
        "seg-1-inicio": "08:00",
        "seg-1-fim": "12:00",
        "seg-2-inicio": "13:30",
        "seg-2-fim": "18:00",
        // Sábado tem horário digitado, mas a caixa não está marcada: o dia não
        // entra. É o que permite fechar o sábado sem apagar o que estava lá.
        "sab-1-inicio": "09:00",
        "sab-1-fim": "13:00",
      }),
    );

    expect(horario).toEqual({
      fuso: "America/Sao_Paulo",
      dias: {
        seg: [
          ["08:00", "12:00"],
          ["13:30", "18:00"],
        ],
      },
    });
  });

  it("dia marcado e sem nenhuma hora não vira faixa vazia", () => {
    const horario = montarHorarioDoFormulario(
      formulario({ fuso: "America/Sao_Paulo", "dia-qua": "on" }),
    );
    expect(horario).toBeNull();
  });

  it("semana inteira sem dia marcado é null — a fila atende 24 horas", () => {
    expect(montarHorarioDoFormulario(formulario({ fuso: "America/Sao_Paulo" }))).toBeNull();
  });

  it("fuso em branco sai do objeto, para o padrão do núcleo valer", () => {
    const horario = montarHorarioDoFormulario(
      formulario({ "dia-ter": "on", "ter-1-inicio": "08:00", "ter-1-fim": "18:00" }),
    );
    expect(horario).not.toHaveProperty("fuso");

    const lido = filaFormSchema.safeParse({
      nome: "Televendas",
      descricao: "",
      distribuicao: "rodizio",
      prazoPrimeiraRespostaMin: "",
      prazoResolucaoMin: "",
      horarioJson: horario,
      mensagemForaHorario: "",
    });
    expect(lido.success).toBe(true);
    expect(lido.data?.horarioJson?.fuso).toBe("America/Sao_Paulo");
  });

  it("ida e volta preserva o que foi digitado", () => {
    const digitado = formulario({
      fuso: "America/Manaus",
      "dia-seg": "on",
      "seg-1-inicio": "08:00",
      "seg-1-fim": "12:00",
      "dia-sab": "on",
      "sab-1-inicio": "09:00",
      "sab-1-fim": "13:00",
    });

    const lido = filaFormSchema.safeParse({
      nome: "Pós-venda",
      descricao: "",
      distribuicao: "carga",
      prazoPrimeiraRespostaMin: "30",
      prazoResolucaoMin: "",
      horarioJson: montarHorarioDoFormulario(digitado),
      mensagemForaHorario: "",
    });
    expect(lido.success).toBe(true);

    const deVolta = lerHorarioParaFormulario(lido.data?.horarioJson);
    expect(deVolta).toEqual({
      fuso: "America/Manaus",
      dias: { seg: [["08:00", "12:00"]], sab: [["09:00", "13:00"]] },
    });
  });

  it("expediente ilegível volta como null — a tela mostra o que o roteador faz", () => {
    expect(lerHorarioParaFormulario({ dias: { seg: "manhã toda" } })).toBeNull();
    expect(lerHorarioParaFormulario(null)).toBeNull();
  });

  it("turno com fim antes do início é recusado, com a explicação do núcleo", () => {
    const lido = filaFormSchema.safeParse({
      nome: "Plantão",
      descricao: "",
      distribuicao: "manual",
      prazoPrimeiraRespostaMin: "",
      prazoResolucaoMin: "",
      horarioJson: montarHorarioDoFormulario(
        formulario({ "dia-sex": "on", "sex-1-inicio": "22:00", "sex-1-fim": "06:00" }),
      ),
      mensagemForaHorario: "",
    });
    expect(lido.success).toBe(false);
    expect(primeiraMensagem(lido)).toContain("duas faixas");
  });
});

describe("prazo em minutos", () => {
  function comPrazo(valor: string) {
    return filaFormSchema.safeParse({
      nome: "Financeiro",
      descricao: "",
      distribuicao: "manual",
      prazoPrimeiraRespostaMin: valor,
      prazoResolucaoMin: "",
      horarioJson: null,
      mensagemForaHorario: "",
    });
  }

  it("campo em branco é ausência de prazo, não zero", () => {
    const lido = comPrazo("");
    expect(lido.success).toBe(true);
    expect(lido.data?.prazoPrimeiraRespostaMin).toBeNull();
  });

  it("número inteiro passa", () => {
    expect(comPrazo("15").data?.prazoPrimeiraRespostaMin).toBe(15);
  });

  it("vírgula decimal recebe frase, não erro de tipo", () => {
    const lido = comPrazo("1,5");
    expect(lido.success).toBe(false);
    expect(primeiraMensagem(lido)).toContain("número inteiro de minutos");
  });

  it("acima de 30 dias é recusado", () => {
    const lido = comPrazo("50000");
    expect(lido.success).toBe(false);
    expect(primeiraMensagem(lido)).toContain("30 dias");
  });
});

describe("campos que a tela envia vazios", () => {
  it("descrição em branco vira null, não string vazia", () => {
    const lido = filaFormSchema.safeParse({
      nome: "Televendas",
      descricao: "   ",
      distribuicao: "manual",
      prazoPrimeiraRespostaMin: "",
      prazoResolucaoMin: "",
      horarioJson: null,
      mensagemForaHorario: "",
    });
    expect(lido.data?.descricao).toBeNull();
    expect(lido.data?.mensagemForaHorario).toBeNull();
  });

  it("distribuição desconhecida é recusada em português", () => {
    const lido = filaFormSchema.safeParse({
      nome: "Televendas",
      descricao: "",
      distribuicao: "sorteio",
      prazoPrimeiraRespostaMin: "",
      prazoResolucaoMin: "",
      horarioJson: null,
      mensagemForaHorario: "",
    });
    expect(lido.success).toBe(false);
    expect(primeiraMensagem(lido)).toContain("rodízio");
  });

  it("resposta rápida sem fila escolhida vale para a empresa toda", () => {
    const lido = respostaRapidaFormSchema.safeParse({
      atalho: "/prazo",
      titulo: "Prazo de entrega",
      texto: "De 2 a 3 dias úteis.",
      filaId: "",
    });
    expect(lido.success).toBe(true);
    expect(lido.data?.filaId).toBeNull();
  });
});
