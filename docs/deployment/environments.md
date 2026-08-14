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
| `DATABASE_URL` | REQUIRED_RUNTIME, SECRET | Also needed at build time for `prisma generate` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | REQUIRED_RUNTIME, SECRET | `assertAuthEnvironment` refuses dev defaults in production/staging |
| `API_ORIGIN`, `LANDING_APP_URL`, `PUBLIC_SITE_URL` | REQUIRED_RUNTIME, ENVIRONMENT_SPECIFIC | |
| `CORS_ALLOWED_ORIGINS` | REQUIRED_RUNTIME, ENVIRONMENT_SPECIFIC | Credentials are enabled; must be exact |
| `AUTH_COOKIE_DOMAIN` | REQUIRED_RUNTIME, ENVIRONMENT_SPECIFIC | Shared parent domain for cross-app cookies |
| `SECRET_ENCRYPTION_KEY` | REQUIRED_RUNTIME, SECRET | `SecretEncryptionService` refuses to start without it in production |
| `EMAIL_PROVIDER`, `EMAIL_SMTP_*`, `EMAIL_FROM*` | REQUIRED_RUNTIME, SECRET (credentials) | Without them every outbound email fails |

### Required by the release chain but **absent from `render.yaml`**

| Variable | Class | Impact |
|---|---|---|
| `PLATFORM_SUPER_ADMIN_EMAIL` | REQUIRED_RUNTIME | `seed:admin` runs in `preDeployCommand` on **every** deploy |
| `PLATFORM_SUPER_ADMIN_PASSWORD` | REQUIRED_RUNTIME, SECRET | Minimum 12 characters |

**Verify these are set in the Render dashboard.** They are documented in
`README.md` and `DEPLOYMENT_CHECKLIST.md` but not declared in `render.yaml`, so
nothing in the repository will remind you.

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
| `PLATFORM_SUPER_ADMIN_*` required by `preDeployCommand` but undeclared in `render.yaml` | **Medium** — a deploy fails at seed time if unset |
| Frontend deployment configuration is not committed | **Medium** — not reproducible from a clean clone |
| No staging environment | **Medium** — changes go local → production |
| `apps/landing` has no `release` script | **Low** — inconsistent with web and admin |
| Health check reports `ok` without testing dependencies | **Medium** — a broken deploy can pass Render's health check |

No hardcoded production secrets, and no secret behind a `NEXT_PUBLIC_` prefix,
were found in committed configuration.
