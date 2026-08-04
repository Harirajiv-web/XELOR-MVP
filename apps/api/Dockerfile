# syntax=docker/dockerfile:1
#
# THE API IMAGE — and the migrator, which is the same build with its dev dependencies kept.
#
# Build from the REPOSITORY ROOT, not from this directory:
#   docker build -f apps/api/Dockerfile -t xelor-api .
#
# Two things about this file are deliberate:
#
#   1. `--filter "@ind-core/api..."` installs the API and the two workspace packages it
#      depends on, and nothing else. Without it the API image also carries Next, React and
#      three.js, because the lockfile is workspace-wide.
#
#   2. The `migrator` stage exists because migrations run through `tsx`, which is a DEV
#      dependency. Pruning it out of the runtime image is correct — an API container has no
#      business being able to rewrite the schema — so migrations get their own image from an
#      earlier stage instead.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ---------------------------------------------------------------- dependencies
# Manifests only, so a source edit does not invalidate the install layer.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/platform/package.json packages/platform/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@ind-core/api..."

# ---------------------------------------------------------------------- build
# platform and db are consumed through dist/, so their order here is load-bearing.
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @ind-core/platform build \
 && pnpm --filter @ind-core/db build \
 && pnpm --filter @ind-core/api build

# ------------------------------------------------------------------- migrator
# Keeps dev dependencies. Runs as the OWNER role, never as app_user — the whole point of
# the two-role model is that the role serving traffic cannot alter the schema.
FROM build AS migrator
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@ind-core/db", "migrate"]

# -------------------------------------------------------------------- runtime
FROM build AS pruned
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter "@ind-core/api..."

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=pruned --chown=node:node /app /app
USER node
EXPOSE 3000
# main.ts reads PORT first, then API_PORT, then 3000.
CMD ["node", "apps/api/dist/src/main.js"]

# --------------------------------------------------------------------- worker
# Same image, different entrypoint. The outbox relay and BullMQ consumers run as their own
# process on purpose — see the comment at the top of apps/api/src/worker.ts.
FROM runtime AS worker
CMD ["node", "apps/api/dist/src/worker.js"]
