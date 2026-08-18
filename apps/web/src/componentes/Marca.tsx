// A marca Mensvra, em curvas.
//
// Por que os glifos são `path` e não texto com uma fonte: logotipo desenhado
// com `font-family` vira outro logotipo na máquina que não tem a fonte, e no
// Cloudflare Workers não há como garantir arquivo de fonte carregado antes da
// primeira pintura. Em curvas, o desenho é o mesmo em qualquer lugar, não pede
// download nenhum e continua nítido em qualquer tamanho.
//
// `fill="currentColor"` de propósito: a marca herda a cor de quem a usa, então
// a mesma peça serve o tema claro, o tema escuro e o fundo da cor de acento sem
// existir em três versões que envelhecem separado.
//
// MENSVRA se escreve com V no lugar do U porque é assim que se escrevia em
// latim, e a palavra é *mensura* — medida. É o nome dito de propósito: o
// produto existe para que a empresa saiba onde perdeu dinheiro enquanto ainda
// dá tempo.

const LARGURA = 636;
const ALTURA = 100;

/** Só o M — o mesmo do logotipo, usado como símbolo isolado. */
export const CAMINHO_M = "M0,100 V0 H20 L52,58 L84,0 H104 V100 H84 V38 L58,84 H46 L20,38 V100 Z";

const GLIFOS = [
  CAMINHO_M,
  "M116,0 H184 V20 H138 V39 H176 V59 H138 V80 H184 V100 H116 Z",
  "M196,100 V0 H216 L260,64 V0 H280 V100 H260 L216,36 V100 Z",
  "M292,68 H311 C311,76 318,81 328,81 C338,81 344,77 344,70 C344,64 340,61 331,58 L313,52 C300,48 293,40 293,28 C293,11 306,0 327,0 C348,0 361,12 361,30 H342 C342,22 336,18 327,18 C318,18 312,22 312,28 C312,34 316,37 325,40 L343,46 C356,50 363,58 363,70 C363,88 350,99 328,99 C306,99 292,87 292,68 Z",
  "M370,0 H392 L412,72 L432,0 H454 L424,100 H400 Z",
  "M462,100 V0 H506 C526,0 538,12 538,30 C538,43 532,52 521,56 L540,100 H518 L502,60 H484 V100 Z M484,20 V40 H504 C511,40 516,36 516,30 C516,24 511,20 504,20 Z",
  "M548,100 L580,0 H604 L636,100 H614 L608,80 H576 L570,100 Z M582,61 H602 L592,28 Z",
];

/**
 * O logotipo por extenso. `altura` em pixels; a largura acompanha.
 *
 * Sem `title` nem `role="img"`: a marca aparece sempre ao lado do nome escrito,
 * e anunciá-la ao leitor de tela faria o nome ser lido duas vezes seguidas.
 */
export function Logotipo({ altura = 24, className }: { altura?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      height={altura}
      width={(altura * LARGURA) / ALTURA}
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {GLIFOS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/**
 * O símbolo: o M dentro do quadrado arredondado. É o que vai na aba do
 * navegador, no atalho da tela inicial e onde o logotipo por extenso não cabe.
 *
 * Aqui as cores são fixas, e não `currentColor`: o símbolo tem fundo próprio e
 * precisa do mesmo contraste em cima de qualquer superfície — inclusive fora do
 * produto, onde não existe tema nosso.
 */
export function Simbolo({ tamanho = 32, className }: { tamanho?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      height={tamanho}
      width={tamanho}
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="128" height="128" rx="28" fill="#13314C" />
      <path transform="translate(28,36) scale(0.692)" fill="#F2F6FA" d={CAMINHO_M} />
    </svg>
  );
}
