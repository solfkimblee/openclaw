FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ src/
RUN pnpm build

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist dist/

USER node
EXPOSE 18789
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/cli/index.js", "gateway"]
