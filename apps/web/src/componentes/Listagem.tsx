import type { ReactNode } from "react";

import { EstadoVazio, type NomeDeIcone } from "@atende/ui";

/**
 * Listagem que troca de FORMA conforme a largura: cartões no celular, tabela no
 * desktop.
 *
 * POR QUE NÃO SÓ ROLAR A TABELA. Uma tabela de 5 colunas em 390 px não fica
 * ruim — fica inútil: ou as colunas encolhem até virar tiras de duas letras, ou
 * o usuário rola lateralmente perdendo de vista a coluna que identifica a linha.
 * O wrapper de rolagem que existia era curativo; num celular, cada registro
 * quer ser um bloco legível, não uma fatia de planilha.
 *
 * POR QUE NÃO `.ie-tabela` DO CHASSI. Ela é grid denso pensado para o ERP —
 * `white-space: nowrap` e `overflow: hidden` em toda célula, para caber mil
 * linhas na tela. Aqui o volume é outro (dezenas de registros) e a leitura no
 * celular importa mais que a densidade.
 *
 * A coluna marcada como `principal` vira o título do cartão; as demais viram
 * pares rótulo/valor. É por isso que o rótulo precisa existir mesmo no desktop,
 * onde ele já está no cabeçalho: no celular ele é a única pista do que é aquele
 * valor.
 */

export interface ColunaDaListagem<T> {
  readonly chave: string;
  readonly rotulo: string;
  readonly conteudo: (linha: T) => ReactNode;
  /** Vira o título do cartão no celular. Exatamente uma coluna deve ter. */
  readonly principal?: boolean;
  /** Alinha à direita no desktop (valores, datas, ações). */
  readonly direita?: boolean;
  /** Escondida no celular — para o que é secundário e ocuparia espaço. */
  readonly soDesktop?: boolean;
}

export function Listagem<T>({
  colunas,
  linhas,
  chaveDaLinha,
  vazioTitulo,
  vazioDescricao,
  vazioIcone = "caixa",
}: {
  readonly colunas: readonly ColunaDaListagem<T>[];
  readonly linhas: readonly T[];
  readonly chaveDaLinha: (linha: T) => string;
  readonly vazioTitulo: string;
  readonly vazioDescricao?: string;
  readonly vazioIcone?: NomeDeIcone;
}) {
  if (linhas.length === 0) {
    return (
      <div className="rounded-2 border border-borda bg-superficie">
        <EstadoVazio icone={vazioIcone} titulo={vazioTitulo} descricao={vazioDescricao} />
      </div>
    );
  }

  const principal = colunas.find((c) => c.principal) ?? colunas[0]!;
  const secundarias = colunas.filter((c) => c !== principal);

  return (
    <>
      {/* CELULAR — um cartão por registro. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {linhas.map((linha) => (
          <li
            key={chaveDaLinha(linha)}
            className="flex flex-col gap-1.5 rounded-2 border border-borda bg-superficie p-3"
          >
            <div className="text-[14px] font-semibold text-texto">{principal.conteudo(linha)}</div>
            <dl className="flex flex-col gap-1">
              {secundarias
                .filter((c) => !c.soDesktop)
                .map((c) => (
                  <div key={c.chave} className="flex items-baseline gap-2 text-[12px]">
                    <dt className="shrink-0 text-texto-fraco">{c.rotulo}</dt>
                    <dd className="min-w-0 flex-1 text-texto-suave">{c.conteudo(linha)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>

      {/* DESKTOP — tabela. */}
      <div className="hidden overflow-hidden rounded-2 border border-borda bg-superficie md:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-borda bg-superficie-2">
              {colunas.map((c) => (
                <th
                  key={c.chave}
                  scope="col"
                  className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-texto-fraco ${
                    c.direita ? "text-right" : "text-left"
                  }`}
                >
                  {c.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={chaveDaLinha(linha)} className="border-b border-borda/60 last:border-0">
                {colunas.map((c) => (
                  <td
                    key={c.chave}
                    className={`px-3 py-2 align-top ${c.direita ? "text-right" : ""}`}
                  >
                    {c.conteudo(linha)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
