# Contributing to Argus

Thanks for helping keep the watch. Argus is young and moving fast — small, focused contributions land quickest.

## Ground rules

- **One issue, one concern, one PR.** Keep diffs focused; don't bundle a refactor with a fix.
- **Tests ride with the change.** A bug fix includes a regression test; a feature includes coverage for its core path. `bun test` must be green.
- **Fail closed.** Anything touching stage gates, review checks, or publish decisions must default to the safe side. When in doubt, stop the pipeline and explain — never guess and ship.
- **No new dependencies without a reason.** Prefer the standard library and what's already in `package.json`; call out any addition in the PR description.
- **Match the codebase.** TypeScript, Bun APIs where natural, small modules with pure functions where possible (look at `src/publish/decision.ts` or `src/workers/retry.ts` for the house style).

## Getting set up

```bash
git clone https://github.com/Timmyy3000/argus && cd argus
bun install
docker compose up -d postgres        # local Postgres on :55432
bun run db:migrate
bun test                             # should be fully green before you start
bun run dev                          # api on :3000
bun run worker                       # second terminal
cd web && bun install && bun run dev # console dev server (proxies to :3000)
```

`cp .env.example .env` and adjust as needed. With all `ARGUS_ENABLE_*` gates off, Argus runs the full intake → triage → discovery → validation pipeline without touching any repo — that's the safest loop for development.

## Project map

| Path | What lives there |
|---|---|
| `src/http/` | Fastify routes: webhooks, status API, setup/manifest flow, standards CRUD |
| `src/github/` | App auth, webhook handling, permissions, PR creation |
| `src/workers/` | The pipeline: `issue-fix-runner.ts` is the heart; launcher, retries, logging |
| `src/triage/`, `src/discovery/`, `src/validation/`, `src/review/`, `src/publish/` | One module per pipeline stage |
| `src/standards/` | Operator AGENTS.md + skills materialization into sandboxes |
| `src/sandbox/` | Host/docker command executors |
| `src/db/schema.ts` + `drizzle/` | Schema and generated migrations (`bun run db:generate`) |
| `web/` | The console (Vite + React, design system in `web/src/styles.css`) |
| `test/` | Bun tests — mostly pure-function tests, no network |

## Making a change

1. Fork and branch from `dev` (the default branch): `feat/<thing>` or `fix/<thing>`.
2. Make the change with tests. Run `bun test` and `bunx tsc --noEmit` (plus `cd web && bunx tsc --noEmit && bun run build` if you touched the console).
3. If you changed `src/db/schema.ts`, run `bun run db:generate` and commit the migration with it.
4. Open a PR against `dev`. Describe **what** changed, **why**, and **how you verified it**. Screenshots for console changes.

## Reporting bugs & proposing features

Open a GitHub issue with reproduction steps (for bugs: what you labeled, what the job detail/logs showed, what you expected). If you run an Argus instance, the job's pipeline view and log stream are exactly the context a maintainer needs — paste them.

And yes — well-scoped bugs on this repo get labeled `agent:fix` and Argus takes a crack at fixing itself first. Don't be offended if the first responder to your issue is the watchman.

## Security issues

Don't open a public issue — see [SECURITY.md](SECURITY.md).
