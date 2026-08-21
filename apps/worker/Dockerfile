# Imagem do worker — o processo sempre-ativo que detém os sockets do WhatsApp e
# TODOS os consumidores de fila. Enquanto ela não estiver rodando em algum
# lugar, o produto só funciona com a máquina de quem desenvolve ligada: a
# mensagem do cliente chega ao webhook, entra na fila do Postgres e fica lá.
#
# O `build` do worker é bundle (esbuild), não emit do tsc — a razão está em
# apps/worker/build.mjs. Sem o bundle esta imagem sobe e morre no primeiro
# import, tentando carregar packages/core/src/index.ts em runtime.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
# O `.npmrc` NÃO é opcional aqui, e a ausência dele foi o que manteve esta
# imagem sem nunca ter sido construída: ele fixa `node-linker=hoisted`, e sem
# isso o pnpm monta a árvore de symlinks padrão — na qual o cliente gerado do
# Prisma não é encontrado pelo patch que roda logo depois do `generate`.
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
# Só o package.json do painel, e só para o workspace bater com o lockfile.
# O código dele não entra: quem roda aqui é o worker.
COPY apps/web/package.json ./apps/web/package.json
COPY packages ./packages
COPY apps/worker ./apps/worker
# Sem `|| pnpm install` de rede de segurança: o fallback silencioso reescrevia o
# lockfile e transformava "a instalação não bate" — que é justamente o sintoma
# de um contexto de build incompleto — numa imagem que sobe diferente do que foi
# testado. Falhar aqui é o comportamento desejado.
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @atende/db generate && pnpm --filter @atende/worker build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo ./
EXPOSE 8080

# O health server é a única entrada de rede além do hub SSE, e é o que o
# monitor externo consulta. Se ele parar de responder, o worker está morto e
# nenhuma conversa está sendo processada — é o alarme que substitui a máquina
# do dono ligada.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "apps/worker/dist/index.js"]
