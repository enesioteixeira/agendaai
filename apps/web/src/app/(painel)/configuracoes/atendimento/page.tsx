import { redirect } from "next/navigation";

/**
 * A seção não tem tela própria: quem chega em `/configuracoes/atendimento` vai
 * para as filas, que são a primeira decisão da operação.
 *
 * POR QUE AS FILAS NÃO MORAM NESTA ROTA. O item de menu do painel acende por
 * prefixo (`NavLateral`), então uma tela em `/configuracoes/atendimento` deixaria
 * "Filas" marcada como página atual também em "Motivos e etiquetas" e em
 * "Respostas rápidas" — dois `aria-current="page"` na mesma navegação, que é
 * defeito de acessibilidade e confusão visual. Com as três telas como irmãs
 * (`/filas`, `/catalogos`, `/respostas`), cada item acende sozinho, e o
 * redirecionamento mantém o endereço curto funcionando.
 */
export default function AtendimentoIndex() {
  redirect("/configuracoes/atendimento/filas");
}
