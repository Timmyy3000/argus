# Resolver

Self-hosted GitHub issue-to-PR bug fixing daemon powered by Codex workers.

## Stack

- Bun + TypeScript
- Fastify
- Drizzle + Postgres
- pg-boss
- Octokit GitHub App integration
- Optional Docker command sandbox for validation and Codex execution

## Development

```bash
bun install
docker compose up -d postgres
bun run db:generate
bun run db:migrate
bun test
bun run queue:smoke
bun run attempt:smoke
bun run dev
```

Run the worker in another terminal:

```bash
bun run worker
```

## Configuration

Copy `.env.example` to `.env` and fill in the GitHub App values:

```bash
DATABASE_URL=postgres://resolver:resolver@localhost:55432/resolver
GITHUB_APP_ID=
GITHUB_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=
OPENAI_API_KEY=
RESOLVER_ENABLE_CODEX=false
RESOLVER_ENABLE_GIT_PUSH=false
RESOLVER_SANDBOX_MODE=host
RESOLVER_SANDBOX_IMAGE=oven/bun:1
```

Important gates:

- `RESOLVER_ENABLE_CODEX=false` clones and discovers a repo, then stops before implementation.
- `RESOLVER_ENABLE_GIT_PUSH=false` allows implementation and validation but stops before pushing a branch or opening a PR.
- `RESOLVER_SANDBOX_MODE=docker` wraps validation and Codex commands in `docker run --network none`.

## GitHub App

Create a GitHub App with:

- Webhook URL: `https://<your-domain>/webhooks/github`
- Webhook secret: same value as `GITHUB_WEBHOOK_SECRET`
- Repository permissions: Issues read/write, Contents read/write, Pull requests read/write, Metadata read
- Subscribe to issue events

Install it on the repos Resolver should watch. A labeled issue starts a job when the label matches the repository policy, currently `agent:fix` by default.

## Runtime Flow

1. GitHub sends an `issues.labeled` webhook.
2. Resolver verifies the signature, upserts installation/repository/issue records, and checks the repo policy.
3. A pg-boss job is queued idempotently for the issue and label.
4. The worker leases an attempt, clones the repo, creates a branch, discovers repo commands, and runs validation.
5. If Codex is enabled, the worker runs `codex exec`, commits any diff, validates again, applies the MVP review gate, and decides whether a PR can be published.
6. If git push is enabled, Resolver pushes the branch and opens a PR. Otherwise it marks the job as needing human attention with a clear reason.

## Status API

- `GET /health`
- `GET /jobs`
- `GET /jobs/:id`

Job details include attempts, events, recent redacted logs, discovery results, validation results, review results, publish decision, and PR data.

## VPS Deployment

Install Bun, Git, Docker, and Postgres access on the VPS. Use Docker Compose for Postgres if you are not using a managed database:

```bash
docker compose up -d postgres
bun install --frozen-lockfile
bun run db:migrate
```

Then install the service templates in `ops/systemd/`, update `WorkingDirectory`, `EnvironmentFile`, `User`, and the Bun path if needed, and start both services:

```bash
sudo systemctl enable --now resolver-api
sudo systemctl enable --now resolver-worker
```

## Current Status

Phase 1 MVP foundation is implemented:

- GitHub webhook intake and signature verification
- Repository policy checks and default trigger label
- pg-boss queueing and smoke verification
- Job attempt leasing, token fencing, stale attempt handling, and redacted logs
- Repo convention discovery with optional `.agents/bug-resolver/discovered.yml`
- Validation command execution
- Gated Codex execution and gated git push/PR creation
- Optional Docker command sandbox
- GitHub accepted/outcome comments
- Operator status endpoints
