# Engine image (Railway / any Docker host). Build from the repo root:
#   docker build -f engine/Dockerfile -t oth-engine .
FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# Workspace manifests first for a cached dependency layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY engine/package.json engine/
RUN pnpm install --frozen-lockfile --filter @oth/engine... --prod=false

COPY packages/shared packages/shared
COPY engine engine

# SQLite lives on a mounted volume (set DATABASE_PATH=/data/oth.sqlite).
RUN mkdir -p /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||process.env.ENGINE_PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@oth/engine", "start"]
