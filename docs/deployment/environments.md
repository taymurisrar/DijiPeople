# Environments

Derived from committed configuration at commit `78716c4`. **No real secrets
appear here** — names and locations only.

---

## What actually exists

| Environment | Status | Evidence |
|---|---|---|
| **LOCAL** | Exists | `packages/config/index.js` default ports; `.env.example` files |
| **PRODUCTION** | Exists | `render.yaml`; `DEPLOYMENT_CHECKLIST.md` |
| **STAGING** | **Does not exist** | No configuration. `assertAuthEnvironment` treats `staging` as production-like, so the *concept* is anticipated in code, but nothing is provisioned |
| DEV / UAT | Not configured | Historical `uat-*` log files exist at the repo root, but no committed configuration |

Do not assume a staging environment is available. Promotion today is
local → production.

---

## LOCAL

| | |
|---|---|
| Landing | `http://localhost:3000` |
| Web | `http://localhost:3001` |
| Admin | `http://localhost:3002` |
| API | `http://127.0.0.1:4000/api` |
| Database | Developer-provided `DATABASE_URL` |
| Source | Any branch |
| Secrets | Per-app `.env` files, gitignored |

Ports come from `packages/config/index.js`. `scripts/next-with-port.mjs` fails
hard on a port collision rather than incrementing.

## PRODUCTION

| | |
|---|---|
| API | **Render** — service `dijipeople-api`, plan `starter` |
| Web / Admin / Landing | **Not configured in-repo** — presumed Vercel, configured in that dashboard |
| Database | **Neon PostgreSQL** (per `DEPLOYMENT_CHECKLIST.md`) |
| Source branch | `main` |
| Secrets | Render dashboard (`sync: false`), Vercel dashboard |
| Migrations | Automatic, via `preDeployCommand` |
| Health check | `GET /api` |

**Target domains** (from `README.md`, not verified live): `dijipeople.com`,
`app.dijipeople.com`, `admin.dijipeople.com`, `api.dijipeople.com`.

---

## Environment variable inventory

Classification: `REQUIRED_BUILD_TIME`, `REQUIRED_RUNTIME`, `OPTIONAL`, `SECRET`,
`PUBLIC`, `ENVIRONMENT_SPECIFIC`, `DEPRECATED`, `UNKNOWN`.

### API — declared in `render.yaml`

| Variable | Class | Notes |
|---|---|---|
| `NODE_ENV`, `APP_ENV` | REQUIRED_RUNTIME, ENVIRONMENT_SPECIFIC | Literal `production` |
| `DATABASE_URL` | REQUIRED_RUNTIME, SECRET | The **runtime** connection. May be pooled. Also needed at build time for `prisma generate` |
| `DIRECT_DATABASE_URL` | OPTIONAL, SECRET | The **migration** connection. Must be direct — see "Which operations need a direct connection" below |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | REQUIRED_RUNTIME, SECRET | `assertAuthEnvironment` refuses dev defaults in production/staging |
| `API_ORIGIN`, `LANDING_APP_URL`, `PUBLIC_SITE_URL` | REQUIRED_RUNTIME, ENVIRONMENT_SPECIFIC | |
| `CORS_ALLOWED_ORIGINS` | REQUIRED_RUNTIME, ENVIRONMENT_SPECIFIC | Credentials are enabled; must be exact |
| `AUTH_COOKIE_DOMAIN` | REQUIRED_RUNTIME, ENVIRONMENT_SPECIFIC | Shared parent domain for cross-app cookies |
| `SECRET_ENCRYPTION_KEY` | REQUIRED_RUNTIME, SECRET | `SecretEncryptionService` refuses to start without it in production |
| `EMAIL_PROVIDER`, `EMAIL_SMTP_*`, `EMAIL_FROM*` | REQUIRED_RUNTIME, SECRET (credentials) | Without them every outbound email fails |

### Which operations need a direct connection

Managed Postgres providers offer the same database on two endpoints. Neon marks
the pooled one with a `-pooler` infix in the hostname; other providers signal it
with a `pgbouncer=true` connection parameter. The pooled endpoint is PgBouncer in
**transaction** pooling mode: a client connection is mapped to a backend
connection only for the duration of a transaction.

That is invisible to the API. A Nest request opens a connection, runs a query and
needs nothing to survive between statements, so the runtime is happy — often
happier — on the pooled endpoint.

It is fatal to **Prisma migrations**. `prisma migrate deploy` takes a
*session-scoped* advisory lock (`SELECT pg_advisory_lock(...)`) so two concurrent
deploys cannot apply the same migration twice, and a session-scoped lock lives on
one backend connection. Under transaction pooling, consecutive statements are not
guaranteed to reach the same backend, so the lock cannot be established at all.
The migration does not run slowly; it fails with `P1002` after the ten-second
lock timeout, deterministically, at any timeout value.

| Operation | Connection | Why |
|---|---|---|
| API runtime queries | `DATABASE_URL` — pooled is fine | No state between statements |
| `prisma migrate deploy` / `dev` / `status` | `DIRECT_DATABASE_URL` | Session-scoped advisory lock |
| `prisma db execute`, `prisma studio` | `DIRECT_DATABASE_URL` | Session state, long transactions |
| Seeds (`seed:config`, `seed:admin`, …) | Either | Ordinary transactional writes |

[`services/api/prisma.config.ts`](../../services/api/prisma.config.ts) supplies
the datasource for every Prisma CLI call in this repository. It prefers
`DIRECT_DATABASE_URL` and falls back to `DATABASE_URL`, so an environment with no
pooler in front of Postgres — local development, CI — sets nothing and behaves
exactly as before. If the url migrations would use *does* name a pooled endpoint,
config load fails immediately with a message naming the variable to set, instead
of the deploy failing ten seconds later with a lock id and no explanation.

This was BUG-0086: it blocked every production release, and because the
migration step is first in `npm --workspace api run release`, it also silently
skipped configuration seeding and legal-document publication.

### Required by the release chain but **absent from `render.yaml`**

| Variable | Class | Impact |
|---|---|---|
| `PLATFORM_SUPER_ADMIN_EMAIL` | REQUIRED_RUNTIME | `seed:admin` runs in `preDeployCommand` on **every** deploy |
| `PLATFORM_SUPER_ADMIN_PASSWORD` | REQUIRED_RUNTIME, SECRET | Minimum 12 characters |

**Declared in `render.yaml` since 2026-08-20.** Set both for an environment's
first deploy, then remove the password: `seed:admin` is a no-op once an active
super admin exists, and it never overwrites an existing admin's password, role
or status. `PLATFORM_SUPER_ADMIN_PASSWORD_RESET=true` is the deliberate
break-glass path. See `docs/environment-variables.md`.

Until that change, the two available configurations were both wrong: unset
aborted `preDeployCommand` on a new environment, and set reset the super admin's
password to the dashboard value on **every** deploy.

### Frontend apps

`NEXT_PUBLIC_*` variables are **PUBLIC and build-time** — baked into the bundle
and visible to anyone. Never put a secret behind a `NEXT_PUBLIC_` prefix.

Key ones: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WEB_URL`,
`NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_LANDING_URL`,
`NEXT_PUBLIC_AUTH_CLIENT_ID`, `NEXT_PUBLIC_APP_ENV`.

Because they are build-time, **changing one requires a rebuild**, not a restart.

### Registration requirement

A new variable must be added in **four** places or it will misbehave:

1. `turbo.json` `globalEnv` — otherwise Turborepo caches across differing values
2. `render.yaml` (API) / the Vercel dashboard (frontends)
3. `docs/environment-variables.md`
4. The relevant `.env.example`

Plus `packages/config` validation if it is required at boot.

---

## Findings from this audit

| Finding | Severity |
|---|---|
| ~~`PLATFORM_SUPER_ADMIN_*` required by `preDeployCommand` but undeclared in `render.yaml`~~ | **Fixed 2026-08-20 (TASK-0010).** Declared in `render.yaml`; `seed:admin` is now a no-op once an active super admin exists, and never overwrites an existing one |
| Frontend deployment configuration is not committed | **Medium** — not reproducible from a clean clone |
| No staging environment | **Medium** — changes go local → production |
| `apps/landing` has no `release` script | **Low** — inconsistent with web and admin |
| Health check reports `ok` without testing dependencies | **Medium** — a broken deploy can pass Render's health check |

No hardcoded production secrets, and no secret behind a `NEXT_PUBLIC_` prefix,
were found in committed configuration.
