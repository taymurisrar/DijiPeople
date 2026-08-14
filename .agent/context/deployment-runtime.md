# Deployment and Runtime

> **Last verified:** 2026-08-14
> **Verified against commit:** 8682dc1
> **Key source files:** render.yaml, turbo.json, package.json, services/api/package.json, services/api/src/main.ts, services/api/src/config/env.validation.ts, services/api/src/common/config/auth.config.ts, packages/config/index.js, scripts/smoke-deployment.mjs, DEPLOYMENT_CHECKLIST.md, docs/environment-variables.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

### Targets

Per `DEPLOYMENT_CHECKLIST.md`:

- **Frontend apps → Vercel** (`apps/web`, `apps/admin`, `apps/landing`, each as a
  root directory; default Next.js output).
- **API → Render** (`render.yaml`).
- **Database → Neon PostgreSQL.**

There is **no `vercel.json`** anywhere in the repo (`git ls-files | grep vercel`
matches only `apps/docs/public/vercel.svg`). Vercel configuration lives in the
Vercel dashboard, not in git.

### `render.yaml` — the single Render service

```yaml
type: web,  name: dijipeople-api,  env: node,  plan: starter
buildCommand:     npm ci && npm --workspace api run build
startCommand:     npm --workspace api run start:prod
preDeployCommand: npm --workspace api run release
healthCheckPath:  /api
```

Declared env vars: `NODE_ENV=production`, `APP_ENV=production`, and `sync: false`
placeholders for `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`API_ORIGIN`, `LANDING_APP_URL`, `PUBLIC_SITE_URL`, `CORS_ALLOWED_ORIGINS`,
`AUTH_COOKIE_DOMAIN`, `SECRET_ENCRYPTION_KEY`, plus the email block
(`EMAIL_PROVIDER=SMTP`, `EMAIL_SMTP_HOST/PORT/SECURE/USER/PASSWORD`,
`EMAIL_FROM`, `EMAIL_FROM_NAME=DijiPeople`). Two inline comments explain why
`SECRET_ENCRYPTION_KEY` and the email block are mandatory — the service refuses
to boot without the former, and every outbound email fails without the latter.

### The release chain

`npm run release:api` → `npm --workspace api run release` →

```
prisma migrate deploy --config prisma.config.ts
&& seed:config     (ts-node prisma/seed-config.ts)
&& seed:verify     (ts-node prisma/verify-seed-config.ts)
&& seed:admin      (ts-node prisma/seed-admin.ts)
```

This is exactly what Render runs as `preDeployCommand`. `seed:config` is
idempotent and production-safe; `seed:verify` fails loudly if required reference
data is missing after the run. **A new required configuration row must be added
to `seed-config` and covered by `verify-seed-config`, or fresh deploys break.**
`seed:demo` is *not* in the release chain.

`npm --workspace api run build` = `clean:dist && prisma:generate && nest build`.
`start:prod` = `node --max-old-space-size=448 dist/src/main.js` — note the output
is `dist/src/main.js`, not `dist/main.js` (a documented "common issue"), and the
heap cap matches the Render starter plan.

### Boot-time env validation — three gates, in order (`main.ts`)

1. `validateDeploymentEnv(process.env, { app: 'api' })` from `@repo/config`
   (`packages/config/index.js`). Always requires `DATABASE_URL`; when
   production-like additionally requires `JWT_ACCESS_SECRET`,
   `JWT_REFRESH_SECRET`, `API_ORIGIN`, `CORS_ALLOWED_ORIGINS`, and enforces
   **≥32 characters** on both JWT secrets. Non-API apps require
   `NEXT_PUBLIC_API_BASE_URL` in production. Throws with an aggregated list.
2. `validateApiEnvironment(process.env)` (`src/config/env.validation.ts`).
   `PRODUCTION_REQUIRED_ENV` (14 keys): `NODE_ENV`, `API_BASE_URL`, `API_ORIGIN`,
   `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, `JWT_ACCESS_SECRET`,
   `JWT_REFRESH_SECRET`, `ADMIN_APP_URL`, `WEB_APP_URL`, `LANDING_APP_URL`,
   `ACCOUNT_ACTIVATION_LINK_BASE_URL`, `PASSWORD_RESET_LINK_BASE_URL`,
   `COOKIE_SECURE`, `COOKIE_SAME_SITE`. `RECOMMENDED_PRODUCTION_ENV` (12 keys —
   the per-client `ADMIN_/WEB_/AGENT_` JWT secrets and cookie names) produce
   **warnings**, logged after `app.listen`. URL-shaped vars are validated as
   `http:`/`https:`.
3. `assertAuthEnvironment(configService)` (`common/config/auth.config.ts`), run
   after Nest is created. In production-like environments it requires 21 further
   keys, including `ADMIN_SESSION_COOKIE`, `AUTH_COOKIE_SECURE`,
   `AUTH_COOKIE_HTTP_ONLY`, `AUTH_COOKIE_SAME_SITE`, `AUTH_COOKIE_PATH`, the
   `*_TTL_SECONDS` set, the `SESSION_*_TIMEOUT_SECONDS` set and
   `AUTH_REFRESH_ROTATION_ENABLED`, then eagerly resolves the TTLs so a malformed
   value fails at boot rather than at first login.

Gates 2 and 3 are **stricter than `render.yaml`** — several keys they require in
production are not declared in `render.yaml` and must be set in the Render
dashboard.

### Runtime shape (`main.ts`)

`bodyParser: false`, log levels derived from `LOG_LEVEL` against the ladder
`error < warn < log < debug < verbose` (production defaults to `['error','warn']`,
otherwise `['error','warn','log']`), `enableShutdownHooks()`,
`setGlobalPrefix('api')`, `cookieParser()`, selective body parsing (see
integration-patterns.md), CORS via `buildCorsOptions(process.env)`, a global
`ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`
and the global `HttpExceptionFilter`. Listens on `process.env.PORT || 4000`,
host `0.0.0.0`.

Three health routes are registered on the raw Express instance **before** Nest
routing: `GET /`, `GET /api`, `GET /api/health`, all returning
`getRuntimeHealthPayload` → `{ app: 'dijipeople-api', status: 'ok', environment,
version, apiBaseUrl, timestamp }`. Render's `healthCheckPath: /api` hits the
second one.

### `turbo.json` `globalEnv`

A flat allowlist of ~90 variable names: env/stage, `DATABASE_URL`, the generic
and per-client JWT secrets/TTLs, the `AUTH_*` session knobs, `AUTH_CLIENT_ID`,
API URLs, `CORS_ALLOWED_ORIGINS`, the `NEXT_PUBLIC_*` set, app URLs, cookie names
and policy, session timeouts, `USE_ENTITY_DATA_API`, `EXPOSE_DEV_AUTH_LINKS`,
branding/support vars.

**Why this matters:** Turborepo hashes task inputs. A variable not in
`globalEnv` does not participate in the cache key, so changing it can return a
**stale cached build** with the old value baked in — the failure
`DEPLOYMENT_CHECKLIST.md` calls "Turbo ignored env changes". Tasks: `build`
(`dependsOn: ["^build"]`, inputs `$TURBO_DEFAULT$` + `.env*`, outputs `.next/**`
minus cache and `dist/**`), `lint`, `check-types`, `dev` (`cache: false`,
`persistent: true`). There is **no `test` task**.

### Ports (`packages/config/index.js`)

`DEFAULT_LOCAL_PORTS = { landing: 3000, web: 3001, admin: 3002, api: 4000 }`,
overridable via `LANDING_PORT` / `WEB_PORT` / `ADMIN_PORT` / `API_PORT`.
`PRODUCTION_APP_URLS` is all empty strings — production URLs come purely from env
(`APP_URL_ENV_KEYS` resolves each app from an ordered list, e.g. web:
`NEXT_PUBLIC_WEB_APP_URL` → `NEXT_PUBLIC_WEB_URL` → `WEB_APP_URL` → `WEB_URL`).
Next dev/start go through `scripts/next-with-port.mjs`; the API's `start:dev`
first runs `scripts/free-port.mjs 4000`.

### Post-deploy smoke — `npm run smoke:deployment`

`scripts/smoke-deployment.mjs`. Base URL from `SMOKE_API_BASE_URL` →
`NEXT_PUBLIC_API_BASE_URL` → `API_BASE_URL` → `http://127.0.0.1:4000/api`;
origin from `SMOKE_ORIGIN` → `NEXT_PUBLIC_WEB_URL` → `WEB_APP_URL` →
`http://localhost:3001`. Checks health endpoint; protected profile rejects an
unauthenticated request; then — only when `SMOKE_LOGIN_EMAIL` /
`SMOKE_LOGIN_PASSWORD` are supplied — login, authenticated profile and major
module list endpoints; finally CORS origin acceptance. Reports TAP-ish
`ok` / `not ok` lines. Related: `admin-runtime-smoke.mjs`,
`platform-final-e2e.mjs`, `stripe-test-mode-smoke.mjs`,
`stripe-webhook-smoke.mjs`, `link-audit.js`, `hydration-probe.js`,
`uat-admin.js`.

### Reference documents

`DEPLOYMENT_CHECKLIST.md` (targets, env, Neon setup, build/start/release
commands, seed behaviour, validation list, common issues),
`docs/environment-variables.md` (app-scoped env matrix with real production
values, plus a note that a Neon `DATABASE_URL` was previously exposed and must be
rotated), and `docs/deployment-env-checklist.md`.

## Key abstractions

- **Three-gate boot validation** — fail fast, at boot, with an aggregated
  message, rather than at first request.
- **`preDeployCommand` as the migration+seed barrier** — migrations, config seed
  and seed verification run before any new instance serves traffic.
- **`globalEnv` as the cache-correctness contract** for env-sensitive builds.
- **Env-derived app URLs** (`APP_URL_ENV_KEYS` fallback chains) so no origin is
  hardcoded for production.
- **Raw-Express health routes** registered ahead of Nest so health checks succeed
  independent of module state.

## Known exceptions

- `render.yaml`'s `buildCommand` omits the explicit `prisma:generate` step that
  `DEPLOYMENT_CHECKLIST.md` shows — it is covered because `api run build` runs
  `prisma:generate` internally.
- Env vars required by `validateApiEnvironment` / `assertAuthEnvironment` but
  **absent from `render.yaml`**: `API_BASE_URL`, `ADMIN_APP_URL`, `WEB_APP_URL`,
  `ACCOUNT_ACTIVATION_LINK_BASE_URL`, `PASSWORD_RESET_LINK_BASE_URL`,
  `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `ADMIN_SESSION_COOKIE`, the `AUTH_COOKIE_*`
  set and the TTL/session set.
- `STRIPE_*`, `MAIL_DELIVERY_MODE`, `SECRET_ENCRYPTION_KEY`, `EMAIL_*`,
  `PLATFORM_SUPER_ADMIN_EMAIL` / `_PASSWORD`, `ENABLE_DEMO_DATA_RESET`,
  `LOG_LEVEL` and `CORS_ALLOWED_HEADERS`/`_METHODS`/`ALLOW_CREDENTIALS` are
  **not in `turbo.json` `globalEnv`**.
- `apps/landing` has no `release` script; `release:web` / `release:admin` are just
  `next build`.
- `docs/environment-variables.md` contains real production hostnames and a
  disclosed-secret warning — treat its values as reference, not as safe to reuse.
- No CI exists (`.github/` absent), so nothing validates a deploy config change
  before it reaches Render or Vercel.

## Anti-patterns to avoid

- Adding an env var without registering it in `turbo.json` `globalEnv` — builds
  silently serve a stale cache with the old value.
- Adding an env var to `render.yaml` only, and assuming boot validation covers it
  (or vice versa) — the three gates and `render.yaml` disagree today.
- Defaulting a production-critical setting in code instead of failing at boot;
  `SecretEncryptionService` throwing in production is the pattern to copy.
- Putting a schema change behind `preDeployCommand` that needs a human decision.
  `migrate deploy` runs unattended and non-interactively.
- Adding a required seed row to `seed-config.ts` without asserting it in
  `verify-seed-config.ts` — the release then succeeds on a broken configuration.
- Adding `seed:demo` to the release chain, or running `migrate reset` / `db push`
  against a shared database.
- Hardcoding a production origin instead of using the `APP_URL_ENV_KEYS` chain in
  `packages/config/index.js`.
- Treating a `GET /api` 200 as deploy verification. It is served by raw Express
  before Nest routing and proves nothing about modules, DB or auth.
- Reusing values from `docs/environment-variables.md` — it documents a disclosed
  `DATABASE_URL` and real hostnames.

## TARGET (required going forward)

1. **Every new env var is registered in four places in the same change**:
   `packages/config/index.js` (validation, if boot-critical),
   `turbo.json` `globalEnv`, `render.yaml` (if the API needs it), and
   `docs/environment-variables.md`. Update `DEPLOYMENT_CHECKLIST.md` when it is
   operationally required.
2. A new required configuration row is added to `prisma/seed-config.ts` **and**
   asserted in `prisma/verify-seed-config.ts`, so `release` fails loudly instead
   of producing a half-configured tenant.
3. Destructive schema changes ship in expand → backfill → contract phases with an
   ExecPlan per `PLANS.md`; `migrate deploy` runs unattended in `preDeployCommand`
   and cannot be interactively recovered.
4. Boot-critical configuration fails at boot with an aggregated, named error —
   never a silent default in production.
5. After a deploy, run `npm run smoke:deployment` with `SMOKE_API_BASE_URL`,
   `SMOKE_ORIGIN` and credentials set; a health check alone is not evidence.
6. Never run `prisma migrate reset` or `db push` against a shared or production
   database; never hand-edit or delete an applied migration.

## What the specialist agent MUST verify before changing this

- Read `render.yaml` and `services/api/package.json` `release` together — the
  Render `preDeployCommand` is only a pointer; the chain is in package.json.
- Read all three validation gates (`packages/config/index.js`
  `validateDeploymentEnv`, `src/config/env.validation.ts`,
  `common/config/auth.config.ts` `assertAuthEnvironment`) before adding or
  removing an env var; the required sets overlap and disagree.
- Grep `turbo.json` `globalEnv` for the variable name before assuming builds will
  pick up a change.
- Confirm `dist/src/main.js` remains the entrypoint if `nest-cli.json` or
  `tsconfig` output settings change.
- Check `services/api/prisma/AGENTS.md` before any migration work.
- Run `npm run prisma:migrate:status` against the target database before
  concluding a deploy is healthy.
