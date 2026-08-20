# Deployment Runtime

> **Last verified:** 2026-08-20
> **Verified against commit:** bab45ad
> **Key source files:** render.yaml, package.json, services/api/src/main.ts,
> services/api/src/config/env.validation.ts, packages/config/index.js,
> turbo.json, scripts/smoke-deployment.mjs, scripts/next-with-port.mjs,
> .github/workflows/ci.yml, .github/workflows/release-app.yml,
> apps/agent-desktop/electron-builder.yml, scripts/lib/release-apps.mjs,
> DEPLOYMENT_CHECKLIST.md, docs/environment-variables.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

---

## CURRENT

### Deployable components

| # | Component | Source | Runtime | Build | Start | Port | Public | Target |
|---|---|---|---|---|---|---|---|---|
| 1 | **API** | `services/api` | NestJS 11 / Node 22 | `npm --workspace api run build` | `npm --workspace api run start:prod` | 4000, prefix `/api` | yes | **Render** — the only target configured in-repo |
| 2 | **Web** | `apps/web` | Next.js App Router | `npm --workspace web run build` | `next-with-port.mjs start 3001` | 3001 | yes | **No in-repo config** |
| 3 | **Admin** | `apps/admin` | Next.js App Router | `npm --workspace admin run build` | `next-with-port.mjs start 3002` | 3002 | yes | **No in-repo config** |
| 4 | **Landing** | `apps/landing` | Next.js App Router | `npm --workspace landing run build` | `next-with-port.mjs start 3000` | 3000 | yes | **No in-repo config**; also has no `release` script |
| 5 | **Agent desktop** | `apps/agent-desktop` | Electron | `npm run build` | `dist:win` → electron-builder NSIS | n/a | installer | Manual distribution |
| 6 | **Gateway** | `gateway/` | .NET (`DijiPeople.Gateway.sln`) | `npm run gateway:build` | on-prem service | n/a | on-prem | `npm run gateway:package` (pwsh) |
| 7 | **ZKTeco POC** | `tools/zkteco-poc` | Node + .NET worker | `npm run zkteco:install` | n/a | n/a | internal | Not deployed |
| 8 | **Database** | — | PostgreSQL (Neon, per `DEPLOYMENT_CHECKLIST.md`) | — | — | — | private | Managed |

**Only component 1 has committed deployment configuration.** There is no
`vercel.json`, no Dockerfile and no docker-compose — verified by inspection at
`78072d2`.

> This paragraph used to end "and **no `.github/` CI**". That is false:
> `.github/workflows/ci.yml` exists with eleven jobs named behind the
> `CI required gate` check, plus `.github/workflows/release-app.yml`. The
> browser dependency remains fail-open through `continue-on-error: true`.
> Reverified 2026-08-17 — see
> [[BUG-0037-integration-patterns-context-denies-four-subsystems-that-exi]].

### Dependency graph

```
landing ─┐
web ─────┼──► API (/api) ──┬──► PostgreSQL
admin ───┘                 ├──► SMTP / email provider
                           ├──► Stripe (billing + raw-body webhook)
                           └──► storage
agent-desktop ──► API (auth client id: agent-desktop)
gateway (on-prem) ──► API (gateway credentials) ──► attendance devices
```

Deployment order follows this graph: **database → API → frontends**.

### Render configuration

```
type: web · name: dijipeople-api · env: node · plan: starter
buildCommand:     npm ci && npm --workspace api run build
startCommand:     npm --workspace api run start:prod
preDeployCommand: npm --workspace api run release
healthCheckPath:  /api
```

`npm --workspace api run release` =
`prisma migrate deploy && seed:config && seed:verify && seed:admin &&
seed:legal && legal:publish -- --confirm`.

The last two were added in TASK-0010. Until then a deployment published no legal
documents, and because the purchase wizard only requires agreements that carry a
**published** version, a purchase recorded no consent at all.

**Migrations run automatically on every Render deploy**, in `preDeployCommand`,
before the new process starts. That is the production migration strategy — there
is no separate manual step, and `prisma migrate dev` is never used in a deployed
environment.

### Health endpoints

`services/api/src/main.ts:76-78` registers three, all returning the same payload:
`/`, `/api`, `/api/health`.

Payload (`getRuntimeHealthPayload`, `env.validation.ts:169`):
`{ app, status: 'ok', environment, version, apiBaseUrl, timestamp }`.

Two verified limitations:

- **`status` is a hardcoded literal.** It tests no dependency. This is a
  liveness probe, not a readiness probe — the API answers `ok` with the database
  unreachable, and Render's `healthCheckPath: /api` will consider it healthy.
- **No git SHA.** `version` reads `npm_package_version` (`0.0.1`). The running
  system cannot be tied to a commit.

### Boot-time environment validation

Three gates in `main.ts`, in order. A missing required variable fails startup
rather than degrading:

1. `validateDeploymentEnv(process.env, { app: 'api' })` — `@repo/config`
2. `validateApiEnvironment(process.env)` — `src/config/env.validation.ts`
3. `assertAuthEnvironment(configService)` — refuses production/staging with
   development auth secrets

### Environment variables

`turbo.json` `globalEnv` is authoritative for cache correctness — a new variable
**must** be registered there or Turborepo caches across differing values.

`render.yaml` declares 19 for the API: `NODE_ENV`, `APP_ENV`, `DATABASE_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `API_ORIGIN`, `LANDING_APP_URL`,
`PUBLIC_SITE_URL`, `CORS_ALLOWED_ORIGINS`, `AUTH_COOKIE_DOMAIN`,
`SECRET_ENCRYPTION_KEY`, `EMAIL_PROVIDER`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`,
`EMAIL_SMTP_SECURE`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD`, `EMAIL_FROM`,
`EMAIL_FROM_NAME`. Secrets use `sync: false` — set in the dashboard, never
committed.

**`PLATFORM_SUPER_ADMIN_EMAIL` / `_PASSWORD` / `_PASSWORD_RESET` are declared**
(`render.yaml`) since TASK-0010. They were required by the release chain and
undeclared, so the first deploy of a new environment aborted in
`preDeployCommand` — before `seed:legal` and `legal:publish` ever ran.

Set the first two for an environment's first deploy, then remove the password:
`seed:admin` is a no-op once an active super admin exists, and **never**
overwrites an existing admin's password, role or status. `_PASSWORD_RESET=true`
is the deliberate break-glass path. See `docs/environment-variables.md`.

### Smoke tooling

`scripts/smoke-deployment.mjs` (`npm run smoke:deployment`) reads
`SMOKE_API_BASE_URL`, `SMOKE_LOGIN_EMAIL`, `SMOKE_LOGIN_PASSWORD`,
`SMOKE_ORIGIN`, falling back to `http://127.0.0.1:4000/api`.

---

## Key abstractions

- `packages/config/index.js` — the single source for ports and URLs. Never
  hardcode a localhost URL or port anywhere in the monorepo.
- `scripts/next-with-port.mjs` — starts Next apps on fixed ports and **fails
  hard on `EADDRINUSE`** rather than incrementing.
- `npm --workspace api run release` — the production migration and seed chain.

## Known exceptions

- **Frontend deployment is not reproducible from the repository — but the target
  is now confirmed.** Web, admin and landing deploy to **Vercel** via a GitHub
  integration: pull-request checks report `Vercel – diji-people-web`,
  `Vercel – diji-people-admin` and `Vercel – diji-people-landing`, each with a
  deployment under the `taimurisrar806-2915s-projects` account. Verified from
  PR #19's checks on 2026-08-16, not from anything committed here. The install
  scope, build command and environment values live in the Vercel dashboard and
  cannot be read from a clean clone. `apps/docs` has no Vercel project.
- `apps/landing` has no `release` script, unlike web and admin.
- Health checks verify no dependencies.
- No deployed-SHA visibility.
- **CI validates a commit; nothing validates a deployment.** Ten required jobs
  gate a merge, but no pipeline deploys anything — every deployment is manual
  and unverified against the merged SHA. This bullet previously read "**No CI**",
  which was false and is corrected.
- `npm run build` runs `--concurrency=1` and is slow.
- **The desktop agent's auto-update feed points at a route that does not exist**
  — [[BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no]] —
  and its installer is unsigned ([[ITEM-0026]]). "Manual distribution" in the
  component table above understates it: `release-app.yml` offers `agent-desktop`
  as a choice but cannot package it.

## Anti-patterns to avoid

- Hardcoding localhost URLs or ports instead of using `@repo/config`.
- Adding an environment variable without registering it in `turbo.json`
  `globalEnv`, `render.yaml` and `docs/environment-variables.md`.
- Treating a 200 from `/api` as proof the system is healthy.
- Running `prisma migrate dev` against any deployed environment.
- Assuming a platform is in use because older documentation says so.

---

## TARGET (required going forward)

**Not implemented.** Do not describe any of this as existing.

1. **Commit frontend deployment configuration**, so all four web-facing
   components are reproducible from a clean clone.
2. **A readiness probe distinct from liveness** — test database connectivity and
   report `degraded` instead of `ok`.
3. **Deployed SHA in the health payload**, injected at build time, so a release
   record can be verified against a running system.
4. **A staging environment** — the repository currently describes only local and
   production topology.
5. **A working, authenticated update channel for the desktop agent**, decided
   together with code signing — [[BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no]]
   and [[ITEM-0026]].

## What the specialist agent MUST verify before changing this

- Which components the change affects, and their order in the graph.
- Whether it is backward compatible for a frontend deployed *before* the API,
  and for an on-prem gateway that upgrades on its own schedule.
- Whether new environment variables are registered in all four places.
- Whether a migration is additive or destructive, and its rollback class.
- That `DATABASE_URL` points at the intended target before any migration.
- Whether `render.yaml` needs updating.
