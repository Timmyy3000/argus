# Argus

Open-source GitHub issue-to-PR bug fixing daemon powered by Codex workers.

Repository: https://github.com/Timmyy3000/argus

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
ARGUS_ENABLE_CODEX=false
ARGUS_ENABLE_TRIAGE=false
ARGUS_ENABLE_LLM_REVIEW=false
ARGUS_ENABLE_GIT_PUSH=false
ARGUS_SANDBOX_MODE=host
ARGUS_SANDBOX_IMAGE=oven/bun:1
```

Important gates:

- `ARGUS_ENABLE_CODEX=false` clones, triages, and discovers a repo, then stops before implementation.
- `ARGUS_ENABLE_TRIAGE=false` uses a deterministic heuristic triage instead of the LLM (an issue is only screened out when it is clearly unactionable).
- `ARGUS_ENABLE_LLM_REVIEW=false` skips the LLM diff review; the deterministic mechanical checks (protected paths, deleted tests, diff size, added secrets) always run.
- `ARGUS_ENABLE_GIT_PUSH=false` allows implementation and validation but stops before pushing a branch or opening a PR.
- `ARGUS_SANDBOX_MODE=docker` wraps validation and Codex commands in a hardened container (`--cap-drop ALL`, `no-new-privileges`, memory/cpu/pid limits). `ARGUS_SANDBOX_NETWORK=none` makes it fully offline; the default `bridge` allows dependency installs and Codex.
- `ARGUS_LLM_MODEL` / `ARGUS_LLM_BASE_URL` configure the model used for triage and review; any OpenAI-compatible endpoint works.

## GitHub App

Create a GitHub App with:

- Webhook URL: `https://<your-domain>/webhooks/github`
- Webhook secret: same value as `GITHUB_WEBHOOK_SECRET`
- Repository permissions: Issues read/write, Contents read/write, Pull requests read/write, Metadata read
- Subscribe to issue events

Install it on the repos Argus should watch. A labeled issue starts a job when the label matches the repository policy, currently `agent:fix` by default.

## Runtime Flow

1. GitHub sends an `issues.labeled` webhook.
2. Argus verifies the signature, upserts installation/repository/issue records, checks the repo policy, resolves the label actor's permission via the collaborator API, and enforces the per-repo concurrency limit.
3. A pg-boss job is queued idempotently for the issue and label. Removing the label cancels the active job.
4. The worker leases an attempt (kept alive by heartbeats; stale attempts are requeued while attempt budget remains), clones the repo, creates a branch, and triages the issue: unactionable issues stop here with a comment explaining what is missing.
5. The worker discovers repo commands and runs baseline validation, so a repository that was already failing is not blamed on the fix.
6. If Codex is enabled, the worker runs `codex exec` with the triage plan and suspect files in the prompt, commits any diff, and validates again.
7. The review gate runs: mechanical checks (protected paths, deleted tests, diff size, added secrets) plus the optional LLM diff review. The publish decision combines review, the baseline-vs-post validation comparison, and discovery confidence into `normal_pr`, `draft_pr`, or `no_pr`.
8. If git push is enabled, Argus pushes the branch and opens a PR whose body carries the triage, validation, and review summaries. Otherwise it marks the job as needing human attention with a clear reason.

Transient failures (clone, push, worker crashes) are retried up to the job's `maxAttempts`. All command output is stored as redacted log chunks, visible through the status API.

## Status API

- `GET /health`
- `GET /jobs`
- `GET /jobs/:id`

Job details include attempts, events, recent redacted logs, triage results, discovery results, validation results, review results, publish decision, and PR data.

## VPS Deployment

Install Bun, Git, Docker, and Postgres access on the VPS. Use Docker Compose for Postgres if you are not using a managed database:

```bash
docker compose up -d postgres
bun install --frozen-lockfile
bun run db:migrate
```

Then install the service templates in `ops/systemd/`, update `WorkingDirectory`, `EnvironmentFile`, `User`, and the Bun path if needed, and start both services:

```bash
sudo systemctl enable --now argus-api
sudo systemctl enable --now argus-worker
```

## Container Deployment

The app can also run as ordinary containers using `compose.deploy.yml`:

```bash
cp .env.example .env
docker compose -f compose.deploy.yml up --build
```

This starts:

- `api`: Fastify webhook/status server on port `3000`
- `worker`: background pg-boss worker
- `migrate`: one-shot Drizzle migration task
- `postgres`: Postgres database, unless `DATABASE_URL` points to another database

For the first remote smoke test, keep these gates disabled:

```bash
ARGUS_ENABLE_CODEX=false
ARGUS_ENABLE_GIT_PUSH=false
ARGUS_SANDBOX_MODE=host
```

That proves webhook intake, queueing, worker execution, discovery, validation recording, and outcome comments without modifying repositories.

Containerizing Argus does not require the worker to control Docker. `ARGUS_SANDBOX_MODE=host` means validation and Codex commands run inside the worker container itself. The Docker command sandbox is opt-in through `ARGUS_SANDBOX_MODE=docker`; only enable it in an environment where you have deliberately provided Docker access to the worker container.

## Current Status

The MVP issue-to-PR loop is implemented end to end:

- GitHub webhook intake with signature verification, collaborator permission checks, per-repo concurrency, and cancellation on label removal
- Issue triage (LLM with deterministic fallback) that screens out unactionable issues and produces a fix plan with suspect files
- Repo convention discovery with optional `.agents/bug-resolver/discovered.yml`
- Baseline and post-fix validation with regression-aware comparison
- Gated Codex execution with triage context in the prompt
- Review gate: deterministic mechanical checks plus optional LLM diff review, feeding a normal/draft/no PR decision
- Worker reliability: heartbeat-extended leases, stale-attempt requeue, crash recovery, and retry of transient failures
- Hardened, configurable Docker command sandbox
- Full redacted command logs, triage/validation/review results, and PR data on the status API
- GitHub accepted/outcome/cancellation comments

Suggested rollout: run with all gates off to prove intake, then enable `ARGUS_ENABLE_TRIAGE`, then `ARGUS_ENABLE_CODEX` (review logs and diffs), then `ARGUS_ENABLE_LLM_REVIEW` and finally `ARGUS_ENABLE_GIT_PUSH`.
