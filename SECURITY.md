# Security Policy

Argus pushes code to repositories and runs agent-written commands. Security reports are taken seriously and handled quickly.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability reporting on this repository (Security → Report a vulnerability), or contact the maintainer directly via the email on the GitHub profile.

Please include reproduction steps and the deployment configuration involved (gates, sandbox mode). You can expect an acknowledgement within a few days.

## Scope notes for self-hosters

- The dashboard token (`ARGUS_DASHBOARD_TOKEN`) protects the console and all status/standards APIs. Treat magic links (`/#token=…`) as credentials.
- GitHub App credentials and webhook secrets live in your Postgres database; protect it accordingly.
- Stage gates fail closed by design. The mechanical review checks (protected paths including `.github/workflows/`, deleted tests, diff size, secret patterns) always run and cannot be disabled by repo content or skills.
- The worker container is the isolation boundary in `host` sandbox mode. Run it with the least privilege your platform allows; use `ARGUS_SANDBOX_MODE=docker` for an additional hardened layer where appropriate.
