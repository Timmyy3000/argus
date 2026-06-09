FROM oven/bun:1

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
RUN bun install --frozen-lockfile

COPY src ./src
COPY scripts ./scripts
COPY test ./test

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV RESOLVER_WORKDIR=/app/.resolver-work
ENV RESOLVER_SANDBOX_MODE=host

EXPOSE 3000

CMD ["bun", "run", "start"]
