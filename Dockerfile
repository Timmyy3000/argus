FROM oven/bun:1

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client \
  && rm -rf /var/lib/apt/lists/*

# Codex CLI for the implementation stage. Authenticates either with
# OPENAI_API_KEY or a ChatGPT subscription via a mounted ~/.codex/auth.json.
ENV BUN_INSTALL_BIN=/usr/local/bin
RUN bun install -g @openai/codex

COPY package.json bun.lock tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
RUN bun install --frozen-lockfile

COPY src ./src
COPY scripts ./scripts
COPY test ./test

COPY web ./web
RUN cd web && bun install --frozen-lockfile && bun run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV ARGUS_WORKDIR=/app/.argus-work
ENV ARGUS_SANDBOX_MODE=host

EXPOSE 3000

CMD ["bun", "run", "start"]
