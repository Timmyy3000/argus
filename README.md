# Resolver

Self-hosted GitHub issue-to-PR bug fixing daemon powered by Codex workers.

## Stack

- Bun + TypeScript
- Fastify
- Drizzle + Postgres
- pg-boss
- Octokit GitHub App integration
- Docker/Podman workers in later phases

## Development

```bash
bun install
docker compose up -d
bun run db:generate
bun run db:migrate
bun test
bun run queue:smoke
bun run attempt:smoke
bun run dev
```

## Current Status

Phase 1 control-plane skeleton is implemented. Phase 2 worker lifecycle scaffolding is in place:

- pg-boss queue creation and smoke verification
- job attempt creation and token fencing
- heartbeat/stale-attempt helpers
- redacted job log chunk writes
- no-op worker runner placeholder for future Docker/Codex execution
