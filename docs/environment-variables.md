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
| `TRUST_PROXY_HEADERS` | API, when behind a proxy | `true` only when a proxy in front of the API sets `X-Forwarded-Host`/`Forwarded`. **Setting this on a directly reachable API lets any caller name any workspace.** |
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

Required production values:

```env
NODE_ENV=production
PORT=4000
API_BASE_URL=https://dijipeople.onrender.com/api
API_ORIGIN=https://dijipeople.onrender.com
DATABASE_URL=<rotated-neon-postgres-url>
CORS_ALLOWED_ORIGINS=https://diji-people-admin.vercel.app,https://diji-people-web.vercel.app,https://diji-people-landing.vercel.app
CORS_ALLOWED_HEADERS=Authorization,Content-Type,X-DijiPeople-App,X-DijiPeople-Client,X-Client-Id,X-Tenant-Slug,X-Requested-With,X-Trace-Id,X-Request-Id
CORS_ALLOWED_METHODS=GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS
CORS_ALLOW_CREDENTIALS=true
ADMIN_APP_URL=https://diji-people-admin.vercel.app
WEB_APP_URL=https://diji-people-web.vercel.app
LANDING_APP_URL=https://diji-people-landing.vercel.app
ACCOUNT_ACTIVATION_LINK_BASE_URL=https://diji-people-web.vercel.app/account/activate
PASSWORD_RESET_LINK_BASE_URL=https://diji-people-web.vercel.app/auth/reset-password
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

## Application release publishing

Read by `services/api` (the publisher endpoint) and by
`scripts/publish-release.mjs` (the CLI). See
[`docs/development/release-publishing.md`](development/release-publishing.md).

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

## Web: Vercel

```env
NODE_ENV=production
NEXT_PUBLIC_APP_NAME=DijiPeople
NEXT_PUBLIC_APP_ORIGIN=https://diji-people-web.vercel.app
NEXT_PUBLIC_WEB_APP_URL=https://diji-people-web.vercel.app
NEXT_PUBLIC_ADMIN_APP_URL=https://diji-people-admin.vercel.app
NEXT_PUBLIC_LANDING_APP_URL=https://diji-people-landing.vercel.app
NEXT_PUBLIC_API_BASE_URL=https://dijipeople.onrender.com/api
API_BASE_URL=https://dijipeople.onrender.com/api
API_ORIGIN=https://dijipeople.onrender.com
WEB_ACCESS_TOKEN_COOKIE=web_access_token
WEB_REFRESH_TOKEN_COOKIE=web_refresh_token
NEXT_PUBLIC_WEB_ROOT_DOMAIN=dijipeople.com
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
NEXT_PUBLIC_APP_ORIGIN=https://diji-people-admin.vercel.app
NEXT_PUBLIC_ADMIN_APP_URL=https://diji-people-admin.vercel.app
NEXT_PUBLIC_WEB_APP_URL=https://diji-people-web.vercel.app
NEXT_PUBLIC_LANDING_APP_URL=https://diji-people-landing.vercel.app
NEXT_PUBLIC_API_BASE_URL=https://dijipeople.onrender.com/api
API_BASE_URL=https://dijipeople.onrender.com/api
API_ORIGIN=https://dijipeople.onrender.com
ADMIN_ACCESS_TOKEN_COOKIE=admin_access_token
ADMIN_REFRESH_TOKEN_COOKIE=admin_refresh_token
NEXT_PUBLIC_WEB_ROOT_DOMAIN=dijipeople.com
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
NEXT_PUBLIC_APP_ORIGIN=https://diji-people-landing.vercel.app
NEXT_PUBLIC_LANDING_APP_URL=https://diji-people-landing.vercel.app
NEXT_PUBLIC_WEB_APP_URL=https://diji-people-web.vercel.app
NEXT_PUBLIC_ADMIN_APP_URL=https://diji-people-admin.vercel.app
NEXT_PUBLIC_API_BASE_URL=https://dijipeople.onrender.com/api
API_BASE_URL=https://dijipeople.onrender.com/api
API_ORIGIN=https://dijipeople.onrender.com
```

## Agent Desktop

```env
NODE_ENV=production
AGENT_APP_NAME=DijiPeople Agent
AGENT_API_BASE_URL=https://dijipeople.onrender.com/api
AGENT_API_ORIGIN=https://dijipeople.onrender.com
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
DIJIPEOPLE_AGENT_UPDATE_URL=https://dijipeople.onrender.com/api/app-releases/feed/agent-desktop
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
