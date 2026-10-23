# Relay image. Build context = repo root:
#   docker build -f apps/relay/Dockerfile -t pcg-relay .
# The workspace is installed in a build stage and the relay is bundled by esbuild into one
# file (ws + @pcg/net-client inlined), so the runtime stage is plain Node with no node_modules.

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/relay/package.json apps/relay/
COPY apps/sunny-side/package.json apps/sunny-side/
COPY packages/net-client/package.json packages/net-client/
RUN pnpm install --frozen-lockfile --filter @pcg/relay...
COPY tsconfig.base.json ./
COPY packages/net-client packages/net-client
COPY apps/relay apps/relay
RUN pnpm --filter @pcg/relay bundle

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /repo/apps/relay/dist/main.mjs ./main.mjs
USER node
EXPOSE 8080
CMD ["node", "main.mjs"]
