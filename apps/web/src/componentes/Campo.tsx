import type { ReactNode } from "react";

/**
 * Primitivos de formulário sobre os tokens do tema.
 *
 * Existem porque treze formulários do app repetiam os mesmos objetos de estilo
 * inline (`lb`, `ip`, `bt`), sete deles com **cópias locais** — e foi isso que
 * fez o botão "Entrar" ficar `#111` sobre fundo navy: corrigir o arquivo
 * compartilhado não alcançava as cópias.
 *
 * Não são componentes de dado: são casca visual em volta dos elementos nativos.
 * O `name` continua sendo o contrato com a Server Action, e nenhum deles
 * controla estado — o formulário segue funcionando sem JavaScript.
 */

export function Campo({
  rotulo,
  children,
  dica,
  className,
}: {
  readonly rotulo: string;
  readonly children: ReactNode;
  readonly dica?: string;
  readonly className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 text-[13px] text-texto ${className ?? ""}`}>
      <span className="font-medium text-texto-suave">{rotulo}</span>
      {children}
      {dica ? <span className="text-[11px] text-texto-fraco">{dica}</span> : null}
    </label>
  );
}

/** Classe compartilhada por input, select e textarea — o foco é o mesmo em todos. */
export const CLASSE_ENTRADA =
  "w-full rounded-2 border border-borda bg-superficie px-3 py-2 text-[13px] text-texto outline-none transition-colors placeholder:text-texto-fraco focus:border-acento disabled:opacity-60";

export function Entrada(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...resto } = props;
  return <input {...resto} className={`${CLASSE_ENTRADA} ${className ?? ""}`} />;
}

export function Selecao(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...resto } = props;
  return <select {...resto} className={`${CLASSE_ENTRADA} ${className ?? ""}`} />;
}

export function AreaDeTexto(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...resto } = props;
  return <textarea {...resto} className={`${CLASSE_ENTRADA} resize-y ${className ?? ""}`} />;
}

/**
 * Linha de campos que empilha no celular.
 *
 * Os formulários legados usavam `flexWrap` com `minWidth` por campo — o que
 * funciona, mas deixa duas colunas espremidas em 390 px em vez de empilhar
 * limpo.
 */
export function LinhaDeCampos({ children }: { readonly children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function ErroDoFormulario({ children }: { readonly children?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-[12px] text-perigo">
      {children}
    </p>
  );
}
