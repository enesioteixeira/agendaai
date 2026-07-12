# Multi-stage build do worker — imagem publicada no GHCR pelo CI (doc 09 §6);
# a VM OCI roda docker-compose + watchtower (auto-pull de imagem nova).

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @atende/db generate && pnpm --filter @atende/worker build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo ./
EXPOSE 8080
CMD ["node", "apps/worker/dist/index.js"]
