# Web image (Next.js standalone) — only needed to host the web on Railway/Docker;
# on Vercel the app builds natively. Build context = repository root:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_GAME_SERVER_URL=... -t cardroom-web .
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /repo

FROM base AS build
# Public config is inlined into the browser bundle at build time.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_GAME_SERVER_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@cardroom/web...

FROM node:24-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
