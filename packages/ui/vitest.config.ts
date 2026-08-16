import { defineConfig } from 'vitest/config'

// O chassi é testado por renderização a string (`react-dom/server`), sem DOM:
// o que se verifica é a MARCAÇÃO que sai — classe do tom, `type` do botão,
// `currentColor` do ícone. Interação (foco, clique, modal) pede jsdom e entra
// junto com o primeiro componente que tenha comportamento próprio.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
})
