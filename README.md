<div align="center">

# 👁 Argus

**The bug-squashing watchman.**

Self-hosted, open-source agent that fixes GitHub issues while you do literally anything else.
Label an issue → Argus triages it, writes the fix with Codex in a sandbox, validates it against
*your own test suite*, runs review gates over the diff, and opens a PR — or stops and tells you why it didn't.

[Deploy](DEPLOY.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

</div>

---

## How it works

```
label → triage → fix (codex) → validate (before & after) → review gates → PR
```

1. **Label** — drop `agent:fix` on an issue in a connected repo. Argus verifies the webhook signature, checks the labeler's permissions, and queues a job.
2. **Triage** — decides whether the issue has enough detail to act on. Unactionable issues are parked for a human with an explanation, not guessed at.
3. **Fix** — Codex writes a patch in an isolated, throwaway workspace, guided by the triage plan and your team's standards.
4. **Validate** — your repo's own install/test/typecheck commands run **before and after** the patch. A repo that was already red is never blamed on the fix; a fix that breaks tests never ships.
5. **Review** — mechanical checks always run (protected paths, deleted tests, diff size, secret detection), plus an optional LLM review pass. The publish decision is `normal_pr`, `draft_pr`, or `no_pr` — fail closed.
6. **PR** — on a clean pass Argus pushes a branch and opens a pull request that carries the triage, validation, and review story. Anything less stops and says why.

Argus's first PR was on its own repo: [Timmyy3000/argus#3](https://github.com/Timmyy3000/argus/pull/3).

## Why Argus

- **Yours, entirely.** Self-hosted, MIT-licensed, no vendor backend, no telemetry. Bring your own Codex subscription — no per-token API billing required.
- **Trust is the product.** Every stage is gated, validated against real tests, and fails closed. Stage gates (`ARGUS_ENABLE_*`) let you roll out one capability at a time.
- **One-click GitHub connect.** The console creates and installs a GitHub App for you via the manifest flow — no manual App configuration.
- **It works the way your team works.** Manage an operator `AGENTS.md` and reusable skill files from the dashboard; they're injected into every fix sandbox and never committed to your repos.
- **A console worth watching.** A live night-watch dashboard: kanban jobs board, per-job pipeline story, streaming logs, attempt history, and standards management.

## Quickstart

The fastest path is Docker Compose ([full guide, including agent-friendly instructions, in DEPLOY.md](DEPLOY.md)):

```bash
git clone https://github.com/Timmyy3000/argus && cd argus
cp .env.example .env       # set ARGUS_DASHBOARD_TOKEN at minimum
docker compose -f compose.deploy.yml up --build -d
```

Then open the dashboard URL printed in the api logs (`Dashboard ready: …/#token=…`), click **Connect GitHub**, pick your repos, and label an issue `agent:fix`.

## Development

```bash
bun install
docker compose up -d postgres
bun run db:migrate
bun test                   # 90 tests
bun run dev                # api on :3000
bun run worker             # in another terminal
cd web && bun install && bun run dev   # console dev server
```

## Stack

Bun + TypeScript · Fastify · Drizzle + Postgres · pg-boss · Octokit (GitHub App) · Codex CLI · Vite + React console

## Configuration

All configuration is environment variables — see [`.env.example`](.env.example) and the [deployment guide](DEPLOY.md). The important ones:

| Variable | Effect |
|---|---|
| `ARGUS_ENABLE_CODEX` | Let Codex write fixes. Off: clone, triage, discover, then stop. |
| `ARGUS_ENABLE_TRIAGE` | LLM triage. Off: deterministic heuristic triage (no API key needed). |
| `ARGUS_ENABLE_LLM_REVIEW` | LLM diff review. Off: mechanical checks still always run. |
| `ARGUS_ENABLE_GIT_PUSH` | Allow pushing branches and opening PRs. Off: stop before publishing. |
| `ARGUS_SANDBOX_MODE` | `host` (default in containers) or `docker` (hardened nested sandbox). |
| `ARGUS_DASHBOARD_TOKEN` | Bearer token protecting the console and APIs. |
| `ARGUS_PUBLIC_URL` | Public base URL — used for webhooks and the GitHub App manifest. |

Every gate **fails closed**: unset, empty, or garbage values mean *off*.

## Status API

`GET /health` · `GET /jobs` · `GET /jobs/:id` · `GET /api/connection` · `GET /api/standards`

All `jobs`/`api` routes require `Authorization: Bearer <ARGUS_DASHBOARD_TOKEN>`.

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first contribution: deploy it, label an issue on your own repo, and file anything that surprised you.

## License

[MIT](LICENSE) © Timmyy3000
