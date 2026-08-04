# syntax=docker/dockerfile:1
#
# THE WEB IMAGE.
#
# Build from the REPOSITORY ROOT:
#   docker build -f apps/web/Dockerfile -t xelor-web .
#
# THE ONE THING THAT WILL CATCH YOU OUT: `NEXT_PUBLIC_*` values are baked into the client
# bundle at BUILD time, not read at runtime. `NEXT_PUBLIC_KEYCLOAK_URL` in particular ends
# up inside the JavaScript the browser downloads, so an image built with the localhost
# default will redirect real users to their own machine on sign-in. They are build args
# here for that reason — changing one means rebuilding the image, not restarting it.
#
# `NEXT_PUBLIC_API_ORIGIN` is the exception: next.config.ts reads it inside `rewrites()`,
# which runs on the server, so it is also honoured at runtime. It is passed both ways.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ---------------------------------------------------------------- dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/platform/package.json packages/platform/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@ind-core/web..."

# ---------------------------------------------------------------------- build
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/web ./apps/web

ARG NEXT_PUBLIC_API_ORIGIN=http://api:3000
ARG NEXT_PUBLIC_KEYCLOAK_URL
ARG NEXT_PUBLIC_KEYCLOAK_REALM=indcore
ARG NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=indcore-api
ARG NEXT_PUBLIC_PUBLIC_DEMO=false
ENV NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN \
    NEXT_PUBLIC_KEYCLOAK_URL=$NEXT_PUBLIC_KEYCLOAK_URL \
    NEXT_PUBLIC_KEYCLOAK_REALM=$NEXT_PUBLIC_KEYCLOAK_REALM \
    NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=$NEXT_PUBLIC_KEYCLOAK_CLIENT_ID \
    NEXT_PUBLIC_PUBLIC_DEMO=$NEXT_PUBLIC_PUBLIC_DEMO \
    NODE_ENV=production

# next.config.ts sets `typescript.ignoreBuildErrors: false`, so a type error fails the
# image rather than shipping a screen that renders a blank column.
RUN pnpm --filter @ind-core/web build

# -------------------------------------------------------------------- runtime
FROM build AS pruned
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter "@ind-core/web..."

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=pruned --chown=node:node /app /app
USER node
EXPOSE 3001
# run-next.mjs appends `--port $PORT` (default 3001) and loads only NEXT_PUBLIC_* values
# from a root .env, so backend settings cannot leak into the browser bundle.
CMD ["node", "apps/web/scripts/run-next.mjs", "start"]
