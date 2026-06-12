# Deploying Argus

A complete, sequential guide to standing up an Argus instance. Written to be followed by a human **or executed by a coding agent** — every step is a concrete command or API call with a verifiable outcome. If you are an agent: follow the steps in order, verify each checkpoint before moving on, and surface the dashboard magic link to your operator at the end.

## What you're deploying

Four containers from `compose.deploy.yml`:

| Service | Role |
|---|---|
| `api` | Fastify server — GitHub webhooks, status API, the web console (port 3000 in-container) |
| `worker` | pg-boss worker that runs the fix pipeline |
| `migrate` | One-shot Drizzle migration task (runs automatically on every deploy) |
| `postgres` | Postgres 16 (skip by pointing `DATABASE_URL` elsewhere) |

Requirements: Docker + Docker Compose on a host reachable from the internet (GitHub must deliver webhooks to it). 1 vCPU / 2 GB RAM is enough to start.

## Step 1 — Configure environment

```bash
git clone https://github.com/Timmyy3000/argus && cd argus
cp .env.example .env
```

Set these in `.env`:

```bash
# REQUIRED
ARGUS_DASHBOARD_TOKEN=<long random hex — protects the console and API>
POSTGRES_PASSWORD=<random>
DATABASE_URL=postgres://resolver:<same password>@postgres:5432/resolver

# RECOMMENDED
ARGUS_PUBLIC_URL=https://<your-domain>   # public base URL; used for webhooks + the App manifest
PORT=3000                                 # host port to publish the api on

# STAGE GATES — start closed, open deliberately (see Step 5)
ARGUS_ENABLE_CODEX=false
ARGUS_ENABLE_TRIAGE=false
ARGUS_ENABLE_LLM_REVIEW=false
ARGUS_ENABLE_GIT_PUSH=false
ARGUS_SANDBOX_MODE=host
```

Leave `GITHUB_APP_ID` / `GITHUB_PRIVATE_KEY` / `GITHUB_WEBHOOK_SECRET` **empty** — the one-click connect flow (Step 3) creates the App and stores credentials in the database. Only set them to reuse a pre-existing GitHub App.

Generate secrets: `openssl rand -hex 16` (or any equivalent).

## Step 2 — Launch and verify

```bash
docker compose -f compose.deploy.yml up --build -d
```

**Checkpoints:**

```bash
curl -s http://localhost:${PORT:-3000}/health        # → {"ok":true}
docker compose -f compose.deploy.yml logs api | grep "Dashboard ready"
# → Dashboard ready: <ARGUS_PUBLIC_URL>/#token=<token>   ← the magic link; opening it signs in automatically
```

If you have a domain, put a reverse proxy (Traefik/Caddy/nginx) with TLS in front of the api port and make sure `ARGUS_PUBLIC_URL` matches the public HTTPS URL. GitHub requires HTTPS for webhooks in practice.

## Step 3 — Connect GitHub (one click)

1. Open the magic link from Step 2.
2. You'll land on the **first-run page**. Click **Connect GitHub**.
3. GitHub creates a private GitHub App owned by your account (via the App-manifest flow — Argus sets the webhook URL and secret itself), then redirects you to the repository picker. Choose the repos Argus should watch.
4. Done. Credentials are stored in Postgres; the **Connections** screen shows the App, gates, and repos under watch.

**Checkpoint:** `GET /api/connection` (with `Authorization: Bearer <token>`) returns `"configured": true` and your repos.

## Step 4 — Codex auth (subscription, not API key)

The worker runs `codex exec` for fixes, billed to a ChatGPT/Codex **subscription** (no per-token charges).

**Easiest — from the console.** Connections → **Connect Codex**. The console shows a one-time code and a verification URL; open the URL on any device, sign in to ChatGPT, enter the code. Done — the credential is written to the shared codex mount and the worker uses it on its next job.

> On ChatGPT **Business/Enterprise** workspaces an admin must first enable **"Allow device code login"** (Workspace Settings → Permissions) or this flow fails. Personal Plus/Pro accounts enable it in their own security settings.

**Alternatives** if device login is unavailable:

- *SSH port forwarding:* `ssh -L 1455:localhost:1455 user@host`, then run `codex login` on the host inside the codex mount's HOME — your local browser completes the callback flow.
- *Copy credentials:* run `codex login` on any machine with a browser, then copy `~/.codex/auth.json` into the codex mount directory on the deploy host. The mount must be **writable** (Codex rotates its tokens).
- *API key:* set `OPENAI_API_KEY` in `.env` — works everywhere but bills at API rates. Leave it empty if you don't want API charges.

**Checkpoint:** the Codex card on the Connections screen shows **connected** (or `docker compose -f compose.deploy.yml exec worker codex login status`).

## Step 5 — Open the gates, one at a time

The safe rollout, verifying each rung on a throwaway issue before the next:

| Order | Set | What it proves |
|---|---|---|
| 1 | (all off) | Webhook intake, queueing, clone, triage, discovery, baseline validation — no repo is modified |
| 2 | `ARGUS_ENABLE_CODEX=true` | Codex writes a patch and post-fix validation runs; still no push |
| 3 | `ARGUS_ENABLE_GIT_PUSH=true` | Full loop: branch pushed, PR opened on a clean pass |
| 4 (optional) | `ARGUS_ENABLE_TRIAGE=true`, `ARGUS_ENABLE_LLM_REVIEW=true` | LLM triage/review — requires an OpenAI-compatible key (`OPENAI_API_KEY`, `ARGUS_LLM_MODEL`); without these Argus uses its deterministic heuristic triage and mechanical-checks-only review, which work fine |

Apply each change by updating `.env` and `docker compose -f compose.deploy.yml up -d` (the migrate service re-runs harmlessly).

**Gates fail closed:** unset, empty, or unrecognized values mean *off*.

## Step 6 — Use it

1. Open an issue on a connected repo describing a bug (concrete symptoms, file hints help).
2. Add the **`agent:fix`** label (the trigger label — per-repo policy). The labeler needs write/maintain/admin permission on the repo.
3. Watch the job on the console: queued → running with the six-stage pipeline (triage → fix → baseline → post-fix → review → publish), streaming logs, then a PR link — or a "needs a human" card explaining exactly where and why it stopped.
4. Removing the label cancels an active job.

### Teach it your house style

Console → **Standards**: edit the operator `AGENTS.md` (commit format, boundaries, testing norms) and add **skills** (named markdown guides, e.g. "drizzle-migrations"). Both are injected into every fix sandbox — Codex reads `AGENTS.md` natively and gets a skill index in its prompt — and are git-excluded so they never appear in a PR.

## Operations reference

- **Logs:** `docker compose -f compose.deploy.yml logs -f api worker`
- **Status API:** `GET /jobs`, `GET /jobs/:id` (attempts, events, redacted logs, validation/review artifacts, PR) — bearer token required
- **Webhook debugging:** `GET /api/deliveries` shows the last 25 webhook deliveries and their outcomes
- **DB migrations:** run automatically via the `migrate` service on every `up`
- **Workspace debugging:** set `ARGUS_KEEP_WORKSPACE=true` to keep job workspaces on disk after a run
- **Nested sandbox (optional):** `ARGUS_SANDBOX_MODE=docker` wraps validation/Codex in a hardened container (`--cap-drop ALL`, `no-new-privileges`, mem/cpu/pid limits; `ARGUS_SANDBOX_NETWORK=none` for offline). Only enable where the worker deliberately has Docker access. The default `host` mode means commands run inside the worker container, which is itself the isolation boundary.
- **Moving domains:** update `ARGUS_PUBLIC_URL`, redeploy, and change the GitHub App's webhook URL at `https://github.com/settings/apps/<your-app-slug>` to `<new-url>/webhooks/github`.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Webhook deliveries failing (check `/api/deliveries` and the App's Advanced tab) | `ARGUS_PUBLIC_URL` doesn't match the public URL, or the App's webhook URL is stale |
| Job stuck `queued` | Worker not running, or per-repo concurrency (1 by default) busy with another job |
| `needs_human: ARGUS_ENABLE_CODEX=false` | That's the gate working — see Step 5 |
| Codex fails immediately in the worker | `auth.json` missing/read-only in the worker's `/root/.codex`, or no network egress |
| PR step fails with "No commits between …" | The fix produced no diff or commit failed — read the job's log stream; the job detail pipeline shows the failing station |
| Console shows "sync fault" | Token mismatch (re-open the magic link) or api container down |
