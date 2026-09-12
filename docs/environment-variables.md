# DijiPeople Environment Variables

Environment is app-scoped. Do not share cookies, JWT secrets, or app origins between `apps/web`, `apps/admin`, `apps/landing`, `apps/agent-desktop`, and `services/api`.

## Security Notes

- A Neon PostgreSQL connection string was previously exposed. Treat it as compromised.
- Rotate the production `DATABASE_URL` in Neon before the next production deploy.
- Store production database and JWT secrets only in Render/Vercel environment variables.
- Do not commit `.env` files containing real secrets.

## Canonical app URLs — required in production

Every surface links to at least one other: the landing header links to the
tenant workspace, the API mails activation links into it, Admin deep-links
operators into a customer's workspace.

**These are mandatory in production and validated at build/boot time.** A
production-like build that omits one, or points one at a loopback host, now
fails with an explicit error rather than silently shipping a dead link — see
[BUG-0026](bugs/BUG-0026-public-login-and-tenant-email-links-resolved-to-localhost-in.md),
where exactly that put `http://localhost:3001/dashboard` behind the public
"Login" button.

| Deployment | Must configure | Because it emits links to |
|---|---|---|
| `apps/landing` | `NEXT_PUBLIC_LANDING_APP_URL`, `NEXT_PUBLIC_WEB_APP_URL` | itself, and the workspace (sign-in) |
| `apps/web` | `NEXT_PUBLIC_WEB_APP_URL` | itself — absolute links and tenant addressing |
| `apps/admin` | `NEXT_PUBLIC_ADMIN_APP_URL`, `NEXT_PUBLIC_WEB_APP_URL` | itself, and tenant workspaces |
| `services/api` | `LANDING_APP_URL`, `WEB_APP_URL`, `ADMIN_APP_URL` | activation, invitation, reset and public-site links |

Each accepts the aliases listed in `APP_URL_ENV_KEYS`
(`packages/config/index.js`) — e.g. `WEB_APP_URL` or `NEXT_PUBLIC_WEB_URL` also
satisfy the workspace URL.

Validation rules, enforced by `validateDeploymentEnv`:

- **Present** — a missing value is a build failure, not a loopback default.
- **Absolute, `http` or `https`** — `app.dijipeople.com` with no scheme is
  rejected.
- **Not loopback** — `localhost`, `127.0.0.1`, `0.0.0.0` and `::1` are rejected.
- The resolved API base URL is checked for loopback too.

> **What counts as production.** `isProductionLike()` is deliberately narrow:
> `APP_ENV` / `NEXT_PUBLIC_APP_ENV` / `DIJIPEOPLE_ENV` set to `production`, or
> `VERCEL=1`, or `RENDER=true`. Bare `NODE_ENV=production` does **not** trigger
> it, so a local `npm run build` and the CI build job keep working against
> loopback defaults. **If you deploy anywhere other than Vercel or Render, set
> `APP_ENV=production` explicitly** — otherwise these checks stay disarmed.

Application code resolves these through `@repo/config` — `resolveAppUrls()`,
`getAppOrigin()` or `buildAppUrl()` — never by reading `process.env` with its
own fallback. `npm run check:no-hardcoded-urls` fails on a loopback literal in
shipped source and `npm run test:app-urls` covers the validation rules; both run
in CI.

## Workspace routing

These decide which tenant a hostname resolves to, so they must be set to the
**same values** on every surface that resolves one — `services/api`,
`apps/web` and `apps/admin`. A deployment where the API and the web proxy
disagree about the base domain will route requests to nothing.

They are read by `packages/config/platform-domains.js`, which is the only place
that parses or builds a hostname. See
[`docs/architecture/workspace-routing-and-domains.md`](architecture/workspace-routing-and-domains.md)
for the full production checklist.

| Variable | Required | Meaning |
|---|---|---|
| `PLATFORM_ENVIRONMENT` | **yes** | `production`, `staging` or `development`. Set explicitly — never rely on `NODE_ENV`, because the development branch is what enables the default-tenant fallback. |
| `PUBLIC_BASE_DOMAIN` | production | The apex the platform hostnames derive from, e.g. `dijipeople.com`. Defaults to the built-in base domain in production only. |
| `TENANT_BASE_DOMAIN` | production | The apex workspace subdomains live under. Defaults to `PUBLIC_BASE_DOMAIN`. Configured separately so workspaces can use a different apex than the marketing site. |
| `APP_HOST` | optional | Global sign-in / workspace discovery host. Derived as `app.<PUBLIC_BASE_DOMAIN>` when unset. |
| `ADMIN_HOST` | optional | Platform admin host. Derived as `admin.<PUBLIC_BASE_DOMAIN>`. |
| `API_HOST` | optional | API host. Derived as `api.<PUBLIC_BASE_DOMAIN>`. |
| `LANDING_HOST` | optional | Marketing host. Defaults to the apex. |
| `TRUST_PROXY_HEADERS` | API and tenant web, when behind a proxy | `true` only when a proxy in front sets `X-Forwarded-Host`/`Forwarded`. Read by both `services/api` and `apps/web` through `packages/config/forwarded-host.js`. Unset, Render and Vercel are inferred as one hop and everything else trusts nothing; an unrecognised value fails closed rather than falling back to that inference. **Setting this on a directly reachable server lets any caller name any workspace.** |
| `DEFAULT_TENANT_SLUG` | development only | Local fallback workspace when the hostname names none. **Must not be set in production or staging** — it is ignored there, but leaving it set is misleading. |
| `TENANT_SLUG_RESERVED_WORDS` | optional | Extra comma-separated slugs to reserve, on top of `RESERVED_HOST_LABELS`. |

Each variable also has a `NEXT_PUBLIC_`-prefixed alias for the Next.js apps, plus
the legacy aliases `NEXT_PUBLIC_TENANT_ROOT_DOMAIN`, `WEB_APP_PROD_ROOT_DOMAIN`
and `NEXT_PUBLIC_WEB_ROOT_DOMAIN` for the tenant base domain.

> Wildcard DNS readiness is **not** an environment variable. It is a platform
> setting an operator asserts in Platform Admin → Settings → Tenant provisioning
> once DNS, proxy routing and TLS are genuinely live. Until it is set, new
> workspace subdomains stay `PENDING` and tenants cannot be activated.

## API: Render

### Two database connections, not one

`DATABASE_URL` is the **runtime** connection. Neon's pooled endpoint — the
hostname carrying the `-pooler` infix — is a good choice for it.

`DIRECT_DATABASE_URL` is the **migration** connection, and it must be the
**direct** endpoint for the same database. Every Prisma CLI call in this
repository resolves its datasource through
[`services/api/prisma.config.ts`](../services/api/prisma.config.ts), which
prefers this variable and falls back to `DATABASE_URL` when it is unset.

The distinction is not a preference. `prisma migrate deploy` serialises
concurrent migrators with a *session-scoped* Postgres advisory lock
(`pg_advisory_lock`), which is bound to one backend connection. The pooled
endpoint is PgBouncer in **transaction** pooling mode, where a client connection
maps to a backend only for the duration of a transaction — so the lock cannot be
established at all. The result is not a slow migration: it is `P1002` after the
ten-second lock timeout, every time, at any timeout value. `preDeployCommand`
aborts, and `seed:config`, `seed:verify`, `seed:admin`, `seed:legal` and
`legal:publish` — everything after the migration step in `npm --workspace api
run release` — never run. That was BUG-0086.

Leave `DIRECT_DATABASE_URL` unset anywhere there is no pooler in front of
Postgres (local development, CI): migrations then use `DATABASE_URL` and nothing
changes. Setting either variable to a pooled url when it is the one migrations
would use is refused at config load with a message naming the fix, rather than
being discovered ten seconds into a deploy.

Required production values:

```env
NODE_ENV=production
PORT=4000
API_BASE_URL=https://api.dijipeople.com/api
API_ORIGIN=https://api.dijipeople.com
DATABASE_URL=<rotated-neon-postgres-url>
DIRECT_DATABASE_URL=<same-database, DIRECT endpoint — no `-pooler` in the host>
CORS_ALLOWED_ORIGINS=https://admin.dijipeople.com,https://app.dijipeople.com,https://www.dijipeople.com
CORS_ALLOWED_HEADERS=Authorization,Content-Type,X-DijiPeople-App,X-DijiPeople-Client,X-Client-Id,X-Tenant-Slug,X-Requested-With,X-Trace-Id,X-Request-Id
CORS_ALLOWED_METHODS=GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS
CORS_ALLOW_CREDENTIALS=true
ADMIN_APP_URL=https://admin.dijipeople.com
WEB_APP_URL=https://app.dijipeople.com
LANDING_APP_URL=https://www.dijipeople.com
ACCOUNT_ACTIVATION_LINK_BASE_URL=https://app.dijipeople.com/account/activate
PASSWORD_RESET_LINK_BASE_URL=https://app.dijipeople.com/auth/reset-password
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
COOKIE_DOMAIN=
ADMIN_COOKIE_DOMAIN=
WEB_COOKIE_DOMAIN=
ADMIN_ACCESS_TOKEN_COOKIE=admin_access_token
ADMIN_REFRESH_TOKEN_COOKIE=admin_refresh_token
WEB_ACCESS_TOKEN_COOKIE=web_access_token
WEB_REFRESH_TOKEN_COOKIE=web_refresh_token
AGENT_ACCESS_TOKEN_COOKIE=agent_access_token
AGENT_REFRESH_TOKEN_COOKIE=agent_refresh_token
STRIPE_SECRET_KEY=<stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-signing-secret>
STRIPE_API_VERSION=2026-02-25.clover
STRIPE_MODE=live
```

JWT secrets must be at least 32 characters. Use different values for:

```env
JWT_ACCESS_SECRET=<global-fallback>
JWT_REFRESH_SECRET=<global-fallback>
ADMIN_JWT_ACCESS_SECRET=<admin-access-secret>
ADMIN_JWT_REFRESH_SECRET=<admin-refresh-secret>
WEB_JWT_ACCESS_SECRET=<web-access-secret>
WEB_JWT_REFRESH_SECRET=<web-refresh-secret>
AGENT_JWT_ACCESS_SECRET=<agent-access-secret>
AGENT_JWT_REFRESH_SECRET=<agent-refresh-secret>
AUTH_ACCESS_TOKEN_TTL_SECONDS=15m
AUTH_REFRESH_TOKEN_TTL_SECONDS=1h
AUTH_IDLE_SESSION_TIMEOUT_SECONDS=1h
AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS=8h
AUTH_REFRESH_ROTATION_ENABLED=true
AUTH_AGENT_ACCESS_TOKEN_TTL_SECONDS=15m
AUTH_AGENT_REFRESH_TOKEN_TTL_SECONDS=90d
AUTH_AGENT_IDLE_SESSION_TIMEOUT_SECONDS=30d
AUTH_AGENT_ABSOLUTE_SESSION_TIMEOUT_SECONDS=30d
```

### Tenant session policy: who actually owns it (ITEM-0162)

**The tenant's `security` settings own tenant session lifetime. These
`AUTH_*` environment variables have no effect on it, on purpose, for now.** A
tenant user's session length is decided by
`TenantAuthPolicyService.resolveEffectivePolicy()`
(`services/api/src/common/security/tenant-auth-policy.service.ts`), which both
`AuthService` (login/refresh) and `JwtAuthGuard` (enforcement) now call — one
resolver, so the two cannot disagree about the effective policy the way they
did in production (a login response advertised an 8-hour idle timeout while
the guard enforced 30 minutes).

For each of `sessionTimeoutMinutes` (access token TTL), `idleTimeoutMinutes`,
`absoluteSessionLifetimeDays` and `refreshTokenExpiryDays`, the precedence is:

1. **The tenant's own `TenantSetting` row** (category `security`), set from
   **Settings → Security & Access → Security Governance → Password & Login
   Policies**. Wins when present.
2. **A hardcoded default** (480 minutes for the two minute-denominated values,
   30 days for the two day-denominated ones) — unchanged from what this
   codebase has always defaulted to — for a tenant with no row.

The `AUTH_*` variables below are **not** consulted as a third fallback, even
though ITEM-0162's original proposal suggested making them one. Production has
all three set — `AUTH_ACCESS_TOKEN_TTL_SECONDS=15m`,
`AUTH_IDLE_SESSION_TIMEOUT_SECONDS=30m`,
`AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS=8h` — to values far shorter than the
hardcoded defaults every tenant with no `security` settings row is currently
living on. Wiring them in as the fallback would silently drop such a tenant's
absolute session lifetime from 30 days to 8 hours — full re-authentication,
daily, for every user, the moment this deploys, with no settings change and no
announcement. That is a product decision for the account owner to make
explicitly, not something to flip as a side effect of a bug-fix batch. See
[[ITEM-0162]]'s Resolution for the record of this being deferred rather than
forgotten.

```env
AUTH_ACCESS_TOKEN_TTL_SECONDS=15m        # platform-admin and agent-desktop only — see below
AUTH_IDLE_SESSION_TIMEOUT_SECONDS=1h     # platform-admin and agent-desktop only
AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS=8h # platform-admin and agent-desktop only
AUTH_REFRESH_TOKEN_TTL_SECONDS=1h        # platform-admin and agent-desktop only
```

These four **do** govern the platform-admin and `agent-desktop` clients
(`getClientAccessTokenTtl`/`getClientIdleTimeoutMs`/etc. in
`services/api/src/common/config/auth.config.ts`, which `JwtAuthGuard` still
falls back to for those two client ids) — only the tenant (`web`) path ignores
them today.

**`SESSION_IDLE_TIMEOUT_SECONDS` and `SESSION_ABSOLUTE_TIMEOUT_SECONDS`
(without the `AUTH_` prefix) are legacy fallbacks, read only when the `AUTH_*`
name above is absent**, for those same non-tenant paths — see
`getSessionIdleTimeoutMs`/`getSessionAbsoluteTimeoutMs` in
`services/api/src/common/config/auth.config.ts`. Set the `AUTH_*` name; the
unprefixed pair exists for backward compatibility with deployments that
predate it, not as an independent second setting.

**`JWT_ACCESS_TTL_REMEMBER_ME` and `JWT_REFRESH_TTL_REMEMBER_ME` apply only to
the platform-admin login path** (`buildPlatformAuthResponse`). No tenant
sign-in reads them — this is by design (platform admin is a separate identity
system with its own policy), not a gap to close. See [[BUG-3357]].

**`allowMultipleActiveSessions`** has no environment-variable override; it is a
per-tenant decision only, and an absent setting means concurrent sessions are
**allowed** — see [[ADR-0010]] and [[BUG-3355]].

### Platform super admin bootstrap

`seed:admin` runs inside `npm run release`, which is `render.yaml`'s
`preDeployCommand`, so it executes on **every** deploy of the API.

```env
PLATFORM_SUPER_ADMIN_EMAIL=<bootstrap-admin-email>
PLATFORM_SUPER_ADMIN_PASSWORD=<at least 12 characters>
```

**Set both for the first deploy of an environment, then remove the password.**
Once an active platform super admin exists, `seed:admin` is a no-op and deploys
stay green without either variable — so a live credential does not have to sit
in the Render dashboard indefinitely.

It will not overwrite an existing admin. A deploy never changes an existing
platform user's password, role or status, because two configurations were
previously the only ones available and both were wrong: leaving the variables
unset aborted `preDeployCommand`, and leaving them set reset the super admin's
password to the dashboard value on every deploy — including a password that had
just been rotated because it leaked.

```env
PLATFORM_SUPER_ADMIN_PASSWORD_RESET=true
```

Break-glass only, for regaining access to an environment. Set it with the two
variables above, deploy once, then unset it — left on, it reapplies the
dashboard value on every subsequent deploy.

Without any of them, a database that has **no** active super admin still fails
loudly rather than deploying: such an environment has nobody who can sign in,
and nobody to attribute legal-document publication to.

Email variables are required only when email delivery is enabled:

```env
ENABLE_EMAILS=true
ENABLE_NOTIFICATIONS=true
ENABLE_ACCOUNT_ACTIVATION_EMAIL=true
ENABLE_PASSWORD_RESET_EMAIL=true
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
SMTP_FROM_EMAIL=no-reply@example.com
SMTP_FROM_NAME=DijiPeople
```

## Transactional outbox worker

Read by `services/api`. The outbox itself is not optional and is not
configurable: every domain service that changes business state writes its event
in the same transaction, always. These variables govern only whether *this
process* also drains the resulting queue.

| Variable | Where | Required | Meaning |
|---|---|---|---|
| `OUTBOX_WORKER_ENABLED` | API | no — defaults off | `true` starts the poll loop in this process. Off by default so tests, seeds and CLI invocations that boot the Nest container do not silently start a background worker. At least one deployed instance must set it, or events are written and never delivered. |
| `OUTBOX_WORKER_POLL_INTERVAL_MS` | API | optional | Poll interval. Defaults to 5000, floored at 1000. |
| `OUTBOX_WORKER_BATCH_SIZE` | API | optional | Events claimed per poll. Defaults to 25, capped at 200. |
| `REPORTS_SCHEDULER_ENABLED` | optional | Runs the scheduled-report worker in this process. Default off. With it off, schedules are editable but nothing is delivered. |
| `REPORTS_SCHEDULER_POLL_INTERVAL_MS` | optional | How often the scheduler looks for due schedules. Default 60000, minimum 15000. |
| `REPORTS_WORKFORCE_SNAPSHOT_ENABLED` | optional | Runs the daily workforce snapshot, which is what makes headcount history true going forward. Default off. |
| `REPORTS_ARTIFACT_RETENTION_DAYS` | optional | How long a generated report export stays downloadable before it is swept. Default 7. |
| `SUBSCRIPTION_ORDER_SWEEPER_ENABLED` | API | no — defaults off | `true` starts the poll loop (BUG-2618) that ages `PENDING_PAYMENT` orders past their 24-hour TTL to `ABANDONED` and releases their `submissionHash`/`requestedSlug` holds. Off by default for the same reason `OUTBOX_WORKER_ENABLED` is. At least one deployed instance must set it, or an abandoned checkout's workspace address is unpurchasable forever. |
| `SUBSCRIPTION_ORDER_SWEEPER_POLL_INTERVAL_MS` | API | optional | Poll interval. Defaults to 900000 (15 minutes), floored at 60000. |
| `SUBSCRIPTION_CHANGE_SWEEPER_ENABLED` | API | no — defaults off | `true` starts the poll loop (BUG-3331, EXECPLAN-0037) that applies `PlanChangeRequest` rows scheduled for a past `effectiveAt` — the scheduled-downgrade half of a plan change, which otherwise never runs (`PlanChangeService.applyDueChanges()` had no caller). Deliberately does not also call `SeatChangeService.applyDueChanges()`: that method reduces `purchasedSeats` locally with no matching Stripe quantity update, so wiring it here would start under-billing a tenant whose seat count was scheduled to decrease — a separate, pre-existing gap this plan does not fix. At least one deployed instance must set this, or a scheduled plan downgrade never takes effect at renewal. |
| `SUBSCRIPTION_CHANGE_SWEEPER_POLL_INTERVAL_MS` | API | optional | Poll interval. Defaults to 900000 (15 minutes), floored at 60000. |

Running the worker on more than one instance is safe — claims use
`FOR UPDATE SKIP LOCKED`, so each event goes to exactly one dispatcher — but
running it on none is not, and nothing fails loudly when you do: the events
accumulate in `PENDING` and the transitions they carry simply never happen.

## Active-employee overage thresholds

Read by `services/api` (`SeatUsageService`). They decide when exceeding
purchased capacity is ordinary business, when the tenant is warned, and when a
human must look before anything is billed.

| Variable | Where | Required | Meaning |
|---|---|---|---|
| `SEAT_OVERAGE_WARN_PERCENT` | API | optional | Overage, as a percentage of purchased capacity, at which the episode becomes `WARNED`. Defaults to 10. |
| `SEAT_OVERAGE_REVIEW_PERCENT` | API | optional | Percentage at which the episode becomes `REVIEW_REQUIRED`. Defaults to 100. |
| `SEAT_OVERAGE_REVIEW_ABSOLUTE` | API | optional | Absolute overage that also forces `REVIEW_REQUIRED`, regardless of percentage. Defaults to 100. |

Both an absolute and a proportional threshold exist because neither alone is
right: 5 over on a capacity of 5 is a doubling and worth a look, while 5 over on
a capacity of 2,000 is noise — and a large jump on a large tenant is one a
percentage would wave through.

The point of `REVIEW_REQUIRED` is the import accident. Going 20 → 22 is ordinary
hiring. Going 20 → 900 overnight is almost always a bad CSV, and silently
generating an invoice for 880 phantom employees is not a billing policy anyone
would defend afterwards. Raising these thresholds makes that outcome *more*
likely, so change them deliberately.

## Object storage (Cloudflare R2)

Read by `services/api/src/common/storage/` (`StorageModule`, `StorageService`,
`resolveStorageConfig`). This is the one place tenant documents, branding
assets, signed contracts, support-case attachments, invoices, screen captures,
data-job files, report exports and app-release installers are read and
written — see `services/api/prisma/migrations/20260910121838_add_object_storage_metadata`
for the metadata columns this backs.

The live Render service never had a persistent disk, so any row whose
`storageProvider` is `NULL` predates this and its bytes are already gone
(`scripts/storage-reconcile.mjs` measures exactly how many). See
[`docs/architecture/object-storage.md`](architecture/object-storage.md) for the
provider abstraction, key layout and authorization rules this configures.

| Variable | Where | Required | Meaning |
|---|---|---|---|
| `STORAGE_PROVIDER` | API | yes | `r2` or `local`. Production refuses to boot with `local` — the container filesystem is ephemeral, so `resolveStorageConfig` fails closed rather than accepting it (FILE-01/INF-05). Defaults to `local` outside production when unset. |
| `FILE_STORAGE_DIR` | API | **development only** | Where the `local` provider writes files. Ignored entirely when `STORAGE_PROVIDER=r2`. Never set this in production — see `STORAGE_PROVIDER` above. Defaults to `storage/uploads` (relative to cwd). |
| `R2_BUCKET_NAME` | API | yes, when `STORAGE_PROVIDER=r2` | The private R2 bucket. Must match `^[a-z0-9][a-z0-9.-]{1,62}$`. |
| `R2_ENDPOINT` | API | yes, when `STORAGE_PROVIDER=r2` | The account's R2 S3-compatible endpoint. Must be `https://` — `resolveStorageConfig` rejects `http://` so credentials and documents are never sent in clear text. |
| `R2_ACCESS_KEY_ID` | API | yes, when `STORAGE_PROVIDER=r2` | R2 API token access key id. |
| `R2_SECRET_ACCESS_KEY` | API | yes, when `STORAGE_PROVIDER=r2` | R2 API token secret. Never logged; never returned in any response. |
| `R2_ACCOUNT_ID` | API | recommended | Not required for S3 API access (the endpoint already carries the account), but its absence usually means the rest of the R2 configuration was assembled by hand and something else is missing too — logged as a boot warning, not an error. |
| `R2_REGION` | API | optional | Defaults to `auto`, which is correct for R2 in effectively every case. |
| `R2_REQUEST_TIMEOUT_MS` | API | optional | Per-request timeout against R2, in milliseconds. Defaults to 15000. Bounded on both ends deliberately — an unreachable R2 must not hold an Express worker open indefinitely. |
| `R2_MAX_ATTEMPTS` | API | optional | SDK retry attempts per request. Defaults to 3. |

`FILE_UPLOAD_MAX_BYTES` (documented under Application release publishing
below) applies to both providers — it is enforced by `StorageService`, not by
either provider implementation.

Read-only reconciliation between the database and the store — orphan rows,
orphan objects — is `scripts/storage-reconcile.mjs` (`npm run
storage:reconcile`). It never modifies anything; there is no `--fix` mode.

## Application release publishing

Read by `services/api` (the publisher endpoint) and by
`scripts/publish-release.mjs` (the CLI). See
[`docs/development/release-publishing.md`](development/release-publishing.md).
An uploaded installer's bytes go through `StorageService` like every other
upload — see [Object storage (Cloudflare R2)](#object-storage-cloudflare-r2)
above for `STORAGE_PROVIDER` and the R2 variables. `externalUrl` remains the
path for artefacts hosted outside DijiPeople storage entirely.

| Variable | Where | Required | Meaning |
|---|---|---|---|
| `RELEASE_PUBLISH_TOKEN` | API | only where publishing is allowed | The machine credential `ReleasePublishTokenGuard` checks. **Unset means publishing is disabled on that environment** — the guard fails closed, which is the intended default for any environment nobody publishes to. Minimum 32 characters. |
| `RELEASE_ARTIFACT_MAX_BYTES` | API | optional | Ceiling for one release artefact. Defaults to 536870912 (512 MB). Deliberately separate from `FILE_UPLOAD_MAX_BYTES`, which governs tenant document uploads and must stay small. |
| `DIJIPEOPLE_RELEASE_TOKEN` | CLI / CI | yes, to publish | The value of the target environment's `RELEASE_PUBLISH_TOKEN`. Never passed as a command-line flag — a flag lands in shell history and in CI logs. |
| `DIJIPEOPLE_RELEASE_API_URL` | CLI / CI | optional | API base URL to publish to, including `/api`. Defaults to `http://localhost:4000/api`. |

Rotation is a two-step: set the new `RELEASE_PUBLISH_TOKEN` on the environment,
then update `DIJIPEOPLE_RELEASE_TOKEN` wherever publishing runs from. No release
record refers to the credential — only the first 12 characters of its SHA-256
appear in the platform audit trail — so rotating one breaks nothing already
published.

> **Workspaces are served from `ws.dijipeople.com`, not the apex.** This is the
> value that has to be right in three places, and getting it wrong is silent in
> a particular way: the app composes a plausible hostname that simply does not
> resolve.
>
> - **Web** and **Admin** read `NEXT_PUBLIC_WEB_ROOT_DOMAIN`. Wrong here and a
>   tenant subdomain stops being recognised as a tenant *and* the company-code
>   step redirects to a dead host — BUG-1644, where no customer could reach
>   their workspace login at all.
> - **Landing** reads `NEXT_PUBLIC_TENANT_BASE_DOMAIN`, and falls back to the
>   marketing apex when it is unset. That fallback is why signup told buyers
>   their workspace would be at `<slug>.dijipeople.com` — BUG-1544.
>
> Both documented values were `dijipeople.com` until 2026-08-27, so a deployment
> configured from this reference reproduced both defects exactly.
>
> **`NEXT_PUBLIC_*` is inlined at build time.** Setting it in the Vercel project
> changes nothing until that project is redeployed; a running deployment keeps
> serving the old string however the dashboard reads.

## Web: Vercel

```env
NODE_ENV=production
NEXT_PUBLIC_APP_NAME=DijiPeople
NEXT_PUBLIC_APP_ORIGIN=https://app.dijipeople.com
NEXT_PUBLIC_WEB_APP_URL=https://app.dijipeople.com
NEXT_PUBLIC_ADMIN_APP_URL=https://admin.dijipeople.com
NEXT_PUBLIC_LANDING_APP_URL=https://www.dijipeople.com
NEXT_PUBLIC_API_BASE_URL=https://api.dijipeople.com/api
API_BASE_URL=https://api.dijipeople.com/api
API_ORIGIN=https://api.dijipeople.com
WEB_ACCESS_TOKEN_COOKIE=web_access_token
WEB_REFRESH_TOKEN_COOKIE=web_refresh_token
NEXT_PUBLIC_WEB_ROOT_DOMAIN=ws.dijipeople.com
NEXT_PUBLIC_DEFAULT_TENANT_SLUG=
SESSION_IDLE_TIMEOUT_SECONDS=3600
SESSION_ABSOLUTE_TIMEOUT_SECONDS=28800
SESSION_REFRESH_THRESHOLD_SECONDS=300
USE_ENTITY_DATA_API=true
EXPOSE_DEV_AUTH_LINKS=false
```

## Admin: Vercel

```env
NODE_ENV=production
NEXT_PUBLIC_APP_NAME=DijiPeople Admin
NEXT_PUBLIC_APP_ORIGIN=https://admin.dijipeople.com
NEXT_PUBLIC_ADMIN_APP_URL=https://admin.dijipeople.com
NEXT_PUBLIC_WEB_APP_URL=https://app.dijipeople.com
NEXT_PUBLIC_LANDING_APP_URL=https://www.dijipeople.com
NEXT_PUBLIC_API_BASE_URL=https://api.dijipeople.com/api
API_BASE_URL=https://api.dijipeople.com/api
API_ORIGIN=https://api.dijipeople.com
ADMIN_ACCESS_TOKEN_COOKIE=admin_access_token
ADMIN_REFRESH_TOKEN_COOKIE=admin_refresh_token
NEXT_PUBLIC_WEB_ROOT_DOMAIN=ws.dijipeople.com
NEXT_PUBLIC_DEFAULT_TENANT_SLUG=
SESSION_IDLE_TIMEOUT_SECONDS=3600
SESSION_ABSOLUTE_TIMEOUT_SECONDS=28800
SESSION_REFRESH_THRESHOLD_SECONDS=300
EXPOSE_DEV_AUTH_LINKS=false
```

## Landing: Vercel

```env
NODE_ENV=production
NEXT_PUBLIC_APP_NAME=DijiPeople
NEXT_PUBLIC_APP_ORIGIN=https://www.dijipeople.com
NEXT_PUBLIC_LANDING_APP_URL=https://www.dijipeople.com
NEXT_PUBLIC_WEB_APP_URL=https://app.dijipeople.com
NEXT_PUBLIC_ADMIN_APP_URL=https://admin.dijipeople.com
NEXT_PUBLIC_API_BASE_URL=https://api.dijipeople.com/api
API_BASE_URL=https://api.dijipeople.com/api
API_ORIGIN=https://api.dijipeople.com
NEXT_PUBLIC_TENANT_BASE_DOMAIN=ws.dijipeople.com
```

## Agent Desktop

```env
NODE_ENV=production
AGENT_APP_NAME=DijiPeople Agent
AGENT_API_BASE_URL=https://api.dijipeople.com/api
AGENT_API_ORIGIN=https://api.dijipeople.com
AGENT_DEVICE_REGISTRATION_ENABLED=true
AGENT_ACCESS_TOKEN_TTL=15m
AGENT_REFRESH_TOKEN_TTL=90d
AGENT_SESSION_IDLE_TIMEOUT_SECONDS=2592000
AGENT_SESSION_ABSOLUTE_TIMEOUT_SECONDS=2592000
AGENT_SESSION_REFRESH_THRESHOLD_SECONDS=300
AGENT_HEARTBEAT_INTERVAL_SECONDS=60
AGENT_HEARTBEAT_BATCH_SIZE=1000
AGENT_OFFLINE_QUEUE_ENABLED=true
AGENT_OFFLINE_QUEUE_MAX_ITEMS=5000
DIJIPEOPLE_AGENT_UPDATE_URL=https://api.dijipeople.com/api/app-releases/feed/agent-desktop
AGENT_AUTO_UPDATE_ENABLED=true
```

## Deployed commit (ITEM-0010)

`GET /api/health` reports the commit actually serving traffic, as `commit` and
`commitShort`, so a release record can **observe** the deployed SHA rather than
assert it from the deploy process. `npm run smoke:deployment` prints it.

| Variable | Required | Notes |
|---|---|---|
| `GIT_COMMIT_SHA` | optional | Explicit override. Set it on any host that does not inject a commit variable of its own. |

The resolver also reads `RENDER_GIT_COMMIT`, `VERCEL_GIT_COMMIT_SHA`,
`GITHUB_SHA` and `SOURCE_VERSION`, in that order after the override, because
those hosts populate them for git-backed services.

When none is present the endpoint reports **`unknown`**, deliberately. It never
falls back to reading local git state: in a running deployment that reports the
commit of whatever machine asked, and a confident wrong SHA in a release record
is worse than an honest absence. `unknown` means the deployment needs a commit
variable — not that the deploy failed.

## Troubleshooting

- `INVALID_CREDENTIALS` from web but not admin: verify `NEXT_PUBLIC_API_BASE_URL`, tenant slug/header behavior, and that the web user belongs to the expected tenant and is active.
- `AUTH_REQUIRED` after admin onboarding: verify admin cookies are `admin_access_token` and `admin_refresh_token`, host-only, Secure on HTTPS, and API requests include `X-DijiPeople-App: admin`.
- CORS failure: `CORS_ALLOWED_ORIGINS` must contain origins only, no `/api`, and never `*` when credentials are enabled.
- Cookie missing in browser devtools: Vercel apps on separate domains should use host-only cookies with empty `COOKIE_DOMAIN`.
