# Game server image. Build context = repository root:
#   docker build -f apps/server/Dockerfile -t cardroom-server .
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@cardroom/server...
# Self-contained production folder: compiled server + built workspace packages + prod deps.
RUN pnpm --filter @cardroom/server deploy --prod /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
