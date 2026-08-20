# Frontend Architecture

> **Last verified:** 2026-08-16
> **Verified against commit:** 78072d2
> **Key source files:** apps/web/app/(authenticated)/layout.tsx, apps/web/lib/server-api.ts, apps/web/lib/auth-config.ts, apps/web/lib/auth.ts, apps/web/lib/tenant-resolution.ts, apps/web/proxy.ts, apps/admin/proxy.ts, apps/admin/app/(internal)/layout.tsx, apps/admin/lib/server-api.ts, apps/admin/lib/auth-config.ts, apps/web/app/api/auth/login/route.ts, apps/web/app/api/teams/route.ts, apps/web/app/api/tenant-settings/branding-assets/route.ts, apps/web/jest.config.js, apps/admin/jest.config.js, apps/landing/jest.config.js, scripts/next-with-port.mjs, packages/config/index.js
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

### Apps and ports

All Next apps boot via `scripts/next-with-port.mjs`, never `next dev`. It
resolves the port from the app env key → `PORT` → default (`:16-26`) and for
`dev` pre-binds and **hard-fails on `EADDRINUSE` rather than auto-incrementing**
(`:57-79`); it forces webpack unless `NEXT_DEV_BUNDLER=turbopack` (`:83-85`).

| App | Port | Env key | Next | Notes |
|---|---|---|---|---|
| `apps/landing` | 3000 | `LANDING_PORT` | 16.2.2 | **no test script, no release script, no proxy.ts** |
| `apps/web` | 3001 | `WEB_PORT` | ^16.2.2 | React 19.2.4; deps only `@repo/config`, `next`, `react`, `react-dom` |
| `apps/admin` | 3002 | `ADMIN_PORT` | 16.2.2 | heaviest deps (TipTap 3.29.2, `clsx`, `lucide-react`) |
| `apps/docs` | 3003 | `DOCS_PORT` | 16.2.0 | unused starter; the only `@repo/ui` consumer |
| `apps/agent-desktop` | — | — | — | Electron 39.2.6; `active-win`, `electron-updater`, `keytar` |

### Route groups

- `apps/web/app/` — `(authenticated)` and `(public)` are the **only** groups.
  Outside any group: `activate-account/`, `api/`, `components/`,
  `dashboard/[...path]/`, `partner/{contracts,leads,profile,referral-links}/`,
  `t/[tenantSlug]/login/`. **The partner portal and tenant-scoped login do not
  get the authenticated shell.**
- `apps/admin/app/` — `(internal)` only (26 route dirs). `login/`,
  `forgot-password/`, `reset-password/`, `access-denied/` sit outside it; there
  is no `(public)` group in admin.
- `apps/landing/app/` — no route groups at all.

### `apps/web/app/(authenticated)/layout.tsx` (241 lines)

Guard `requireSessionUser("/")` (`:64`), plus a dead belt-and-braces
`redirect(LOGIN_ROUTE)` (`:66-68`) — `requireSessionUser` already redirects
(`apps/web/lib/auth.ts:67-75`). Derived first: `roleLabel` (`:70`),
`selfService = isSelfServiceUser(user.permissionKeys)` (`:71`).

**The `Promise.all` at `:73-101` — six calls, every one individually
`.catch`-guarded, so a failing upstream degrades one feature and never blanks
the app:**

| Call | Line | Fallback | Feeds |
|---|---|---|---|
| `GET /tenant-settings/features/availability` | `:81-83` | `null` | `DashboardSidebar enabledFeatureKeys` (`:165`) |
| `getCurrentEmployee()` → `/employees/me/context` | `:84-87` | `{employee:null,isReportingManager:false}` | avatar src + cache key (`:106-113`), sidebar `isReportingManager` (`:166`), `placement` (`:177`) |
| `getResolvedTenantSettings()` → `/tenant-settings/resolved` | `:88` | `null` | `SystemPreferencesProvider` (`:136`), branding CSS vars (`:115-126`), `data-theme` (`:156-160`), session timeout (`:128-133`) |
| `getBusinessUnitAccessSummary()` → `/organization-access/me` | `:89` | `null` | `AuthenticatedShellProvider` (`:151`) **and** `DashboardSidebar` (`:172`) |
| `GET /timesheets/access-restriction` | `:90-92` | `{item:null}` | the amber banner (`:196-217`) |
| `GET /navigation/sidebar` | `:98-100` | `[]` | `DashboardSidebar navOverrides` (`:176`) |

The last carries a comment (`:93-97`) — losing a tenant's sidebar customization
is recoverable, losing all navigation is not. Keep it.
`getResolvedTenantSettings` is `react.cache()`-wrapped (`:32-36`) so
`generateMetadata` (`:38-57`) and the body share one fetch. Session timeout is
floored at 15 min (`:128-133`). Avatars always go through
`/api/employees/${id}/profile-image` (`:106-108`), never upstream.

Provider nesting (`:135-225`): `SystemPreferencesProvider` →
`AuthenticatedShellProvider` → `div.dp-theme-scope` with `data-theme` + CSS-var
style (`:154-162`) → `DashboardSidebar` + `DashboardTopbar` → `ErrorProvider`
→ `NotificationPopupProvider` → banner → `{children}` (`:218`).

`apps/admin/app/(internal)/layout.tsx` is 49 lines: `requireSystemAdminUser`
(`:15`), **one** fetch (`/super-admin/platform-settings`, `.catch` to empty,
`:18-24`), no `Promise.all`; `ErrorProvider` → `ToastProvider` →
`PlatformDefaultsProvider` → `AdminShell` (`:27-42`).

### `apps/web/lib/server-api.ts` (763 lines)

Exports `ApiRequestError` (`:51-94`), `apiRequest` (`:96-189`),
`apiRequestJson<T>` (`:428-440`), `proxyApiJsonResponse` (`:442-478`),
`proxyApiFileResponse` (`:480-503`), `isApiRequestError` (`:505`),
`getApiErrorMessage` (`:509`).

**Cookie auth** — reads `ACCESS_TOKEN_COOKIE`/`REFRESH_TOKEN_COOKIE` from
`await cookies()` (`:102-104`). Names from `apps/web/lib/auth-config.ts`, prefix
`dp_web` (`:2`): `dp_web_access_token`, `dp_web_refresh_token`,
`dp_web_session_id`, `dp_web_tenant_slug` (`:3-17`). Admin uses `dp_admin` plus
`dp_admin_remember_me` (`apps/admin/lib/auth-config.ts:6-22`). **Disjoint
namespaces.**

**⚠ The client header is `X-DijiPeople-App`, NOT `X-DijiPeople-App`.**
`X-DijiPeople-App` appears **nowhere in code** — only in `AGENTS.md:300`,
`apps/web/AGENTS.md:127`, `apps/admin/AGENTS.md:108`,
`docs/architecture/authentication.md:127`, `docs/architecture/frontend.md:167`.
The real header is set at `server-api.ts:201-203` from `AUTH_APP_CLIENT_ID` —
literal `"web"` (`apps/web/lib/auth-config.ts:1`) / `"admin"`
(`apps/admin/lib/auth-config.ts:6`) — and also at `:273`, `apps/web/proxy.ts:113`
and `api/auth/login/route.ts:43`. The same value is verified **inside the JWT**
(`aud` + `appClientId` + token-use, `apps/web/proxy.ts:270-277`, `:298-302`), so
a web token cannot be replayed as an admin token.

Also set: `Authorization: Bearer` only when `includeAuth && accessToken` and not
already present (`:198-200`); `X-Request-Id` and `X-Trace-Id` both a generated
`web_<uuid>` (`:204-208`, `:756-762`); content type inferred from body shape and
left alone for `FormData` (`:620-658`).

**Refresh-on-401** — `POST ${baseUrl}/auth/refresh` (`:269-278`).
*Pre-emptive*: refresh before the first fetch when `includeAuth && !accessToken
&& refreshToken` (`:112-123`). *Reactive*: on 401, refresh and replay **once**
(`:143-160`) — no loop. *Mutex*: `inFlightRefreshes` (`:226`) returns the
in-flight promise for the same key (`:315-319`), cleared in `.finally`
(`:321-323`); the comment at `:215-225` records why (eight parallel loads fired
eight refreshes). *Negative cache*: `deadRefreshTokens` (`:227`) marks a token
dead on 401/403 (`:286-288`), leaves other statuses retryable, and
**deliberately does not poison on network errors** (`:299-302`);
`DEAD_TOKEN_TTL_MS = 30_000` (`:234`), bounded at 500 with oldest-first eviction
(`:235`, `:242-249`). Both maps key on `refreshToken.slice(-24)` (`:237-240`) so
the credential is not retained and one dead session cannot suppress another's.
Excluded paths (`:412-426`): login, logout, refresh, signup, activate-account,
reset-password. `persistRefreshedAuthCookies` (`:329-367`) sets max-age only
when `rememberMe` and is wrapped in `try/catch` because Server Components
cannot mutate cookies (`:363-366`).

**Error normalisation** — `buildApiRequestError` (`:524-553`) delegates shape
parsing to `normalizeApiError` (`apps/web/lib/api-error.ts`) and resolves
`traceId` through `standardError.traceId` → `x-trace-id` → `x-request-id` →
`X-Request-Id` (`:534-539`). Transport failures normalise before any HTTP
status: timeout → `408 / REQUEST_TIMEOUT` (`:165-174`), network → `503 /
NETWORK_ERROR` (`:177-185`); `extractFetchErrorMessage` (`:712-732`) rewrites
undici's `"fetch failed"` into a message naming port 4000. Default timeout
30 s (`:35`), per-call overridable via `AbortController` (`:125-131`,
`:734-754`).

**Base URL** — `packages/config/index.js:123-133`: first defined of
`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_API_URL`, `API_BASE_URL`, `API_URL`,
else `${getAppOrigin("api", env)}/api`.

**`apps/admin/lib/server-api.ts` is materially weaker** — same four exports
(`:27`, `:72`, `:96`, `:114`) but **no refresh dedup, no dead-token cache
(`:53-69`), no pre-emptive refresh, no timeout/AbortController at all, and no
network-error normalisation**; refresh exclusion is a single `path ===
"/auth/refresh"` (`:53`); it sets `Content-Type: application/json` for *any*
body (`:43-45`), which breaks `FormData`; its error class uses a positional
constructor and never sets `this.name`.

### `apps/web/app/api/**` route handlers

**411 `route.ts` files** across 80 top-level dirs (admin 71, landing 4). There
is **no generic catch-all proxy** — all 411 are hand-written per endpoint.
`proxyApiJsonResponse` is imported by **353**, `proxyApiFileResponse` by **24**.
Only **12** do not import `lib/server-api`, essentially the auth endpoints that
must reach the API without cookie auth.

Canonical shape — `api/employees/route.ts`: `GET` forwards the querystring
untouched (`:4-12`), `POST` forwards the body in a try/catch (`:14-32`). No auth
logic; cookie→Bearer translation happens inside `apiRequest`.

**"Thin proxies, no authorization decisions" is broadly true, with exactly two
exceptions** (a grep of all 411 for
`permissionKeys|roleKeys|requireSessionUser|getSessionUser|hasPermission|isSelfServiceUser|tenantId`
matches two files):

1. `api/teams/route.ts:7-14` — checks `permissionKeys.includes("teams.read")`
   but **fails open into `Response.json({items: []})`**, a 200 not a 403, and
   guards only the lookup-shaped query; plain `GET` and `POST` (`:21-30`) are
   unchecked.
2. `api/tenant-settings/branding-assets/route.ts` — requires a session (401,
   `:40-47`), enforces a five-key setting allow-list (`:6-12`, `:53-58`), MIME
   allow-lists (`:13-29`, `:67-78`) and a 3 MB cap (`:80-85`), and critically
   sets **`uploadFormData.set("entityId", user.tenantId)` (`:90`)** — tenant from
   the session, never the body.

**Admin has zero route-handler authorization** — none of its 71 route files
reference `@/lib/auth`, `permissionKeys`, `roleKeys` or `getSessionUser`.

### Tenant resolution — `apps/web/lib/tenant-resolution.ts` (242 lines)

Exports `TenantHint` (`:1-5`), `RESERVED_HOST_LABELS` (`:7-47`),
`getTenantHintFromRequest` (`:49-103`), `getTenantHintFromHost` (`:105-157`),
`getDefaultTenantSlug` (`:159`), `getAppBaseUrl` (`:166`),
`getTenantRootDomain` (`:178`), `supportsTenantSubdomains` (`:185`),
`resolveTenantSlugFromRequest` (`:189`), `isReservedSubdomain` (`:198`),
`normalizeHost` (`:202`), `normalizeTenantSlug` (`:212`).

`RESERVED_HOST_LABELS` (`:7-47`, one per line `:8-46`, 40 entries): `admin, api,
app, auth, login, logout, signup, register, dashboard, settings, www,
dijipeople, tenant, tenants, system, platform, portal, support, help, docs,
billing, account, accounts, root, superadmin, assets, static, cdn, mail, email,
smtp, status, health, public, private, security, sso, oauth, callback`.

**Precedence — cookie wins first** (`:54-62`), then host if not `generic`
(`:64-68`), then `?tenant=` (typed `tenantCode` when it matches
`/^TEN-\d{6,}$/i`, else a slug, `:70-86`), then the env default (`:88-96`),
finally `{type:"generic", value:null}` (`:98-102`).

Subdomain → slug (`:105-157`): `normalizeHost` strips scheme/path/port/trailing
dot and lower-cases (`:202-210`); localhost and known generic hosts → generic
(`:108-126`); otherwise the label before the configured root domain is accepted
**only if** non-empty, dot-free (no nested `a.b.root`) and not reserved
(`:130-137`). A reserved or multi-label subdomain falls through to `generic`
(`:145-149`), **not** `domain`. A host outside the root domain becomes a custom
`domain` hint (`:152-156`). `normalizeTenantSlug` accepts only
`/^[a-z0-9]+(?:-[a-z0-9]+)*$/` (`:212-216`).

Env: `NEXT_PUBLIC_DEFAULT_TENANT_SLUG`/`DEFAULT_TENANT_SLUG` (`:161-162`);
`NEXT_PUBLIC_WEB_ROOT_DOMAIN`/`WEB_APP_PROD_ROOT_DOMAIN` (`:180-181`);
`getAppBaseUrl` walks six vars defaulting to `http://localhost:3001` (`:166-176`).

Six callers, all in web: `proxy.ts:13`, `lib/auth.ts:13`, `app/layout.tsx:8`,
`app/(public)/login/page.tsx:8`, `app/api/auth/logout/route.ts:14`,
`lib/tenant-url.ts:6`. **No admin or landing equivalent** —
`apps/admin/lib/tenant-slug.ts` is slug *authoring/validation* for tenant
creation, not host resolution.

### ⚠ `middleware.ts` does not exist — it is `proxy.ts`

Next 16 renamed the file. `apps/web/middleware.ts` and `apps/web/src/middleware.ts`
do **not** exist; `apps/web/proxy.ts` (393 lines) and `apps/admin/proxy.ts` each
export `proxy(request: NextRequest)`. `apps/landing/proxy.ts` does not exist.

`apps/web/proxy.ts` matcher (`:75-79`) excludes `api`, `_next/static`,
`_next/image`, `favicon.ico`, `robots.txt`, `sitemap.xml` — **`/api/*` is
deliberately outside the proxy** because route handlers authenticate via
`apiRequest`. Order (`:36-73`): (1) protected route with no access *or* refresh
cookie → tenant-aware login redirect with `?next=` (`:42-47`, `:234-252`);
(2) protected + GET + not a prefetch (`:81-87`) + access token within
`ACCESS_TOKEN_REFRESH_BUFFER_SECONDS = 300` of expiry (`:16`, `:89-103`) →
refresh (`:105-153`), on 401/403 `redirectToLogout` (`:208-232`), on success
`continueWithRefreshedTokens` (`:155-206`) which **rewrites the inbound `cookie`
request header** so the current render sees the new token (`:161-167`,
`:321-345`); (3) `/login` with a session cookie → `/` (`:66-68`); (4) otherwise
`NextResponse.next()` with **`x-dijipeople-pathname`** (`:70-72`), which
`(authenticated)/layout.tsx:48` reads for the page title.

JWT handling in the proxy is **decode-only** (`:254-319`) — a routing hint;
signature verification is `JwtAuthGuard` upstream. The file also duplicates
`getApiBaseUrl` (`:347-357`) with different precedence (`API_INTERNAL_URL`
first) than `@repo/config`.

`apps/admin/proxy.ts` is stricter: typed `validateJwt` failure reasons
(`:20-31`), `CLOCK_SKEW_SECONDS = 5` (`:33`), whole body in try/catch (`:39`),
refresh **gated on the remember-me cookie** (`:52-58`), and it clears auth
cookies itself on failure (`:66-75`).

### Auth flow (web)

`apps/web/app/(public)/` has 4 routes / 8 files: `login/` (two-step —
`company-code-login-step.tsx` then `login-form.tsx`), `partner-login/`,
`reset-password/`, `activate/`.

Cookies are set in **four** server-side places, all `httpOnly`; **no
client-side token storage anywhere**: `api/auth/login/route.ts:95-120`
(validates upstream shape first, returns **502** if tokens are missing
(`:64-72`), returns only `{ok, user, tenant}`; max-ages are `undefined` →
session cookies when remember-me is false, `:79-93`);
`api/auth/refresh/route.ts:93-105`; `api/auth/me/route.ts:65-70` (and clears at
`:89-91`); and the two silent-refresh paths (`proxy.ts:175,184,195`,
`server-api.ts:345,350,357`). Logout
(`api/auth/logout/route.ts:181,183`) clears each cookie twice — with and without
the cookie domain.

### Testing

`apps/web/jest.config.js` and `apps/admin/jest.config.js` are near-identical:
**`testEnvironment: "node"`** (`web:16`, `admin:15`), `testMatch:
["<rootDir>/**/*.spec.ts"]` (`web:17`, `admin:16`) — **`.spec.ts` only, no
`.test.ts`, no `.tsx`** — `ts-jest` with an inline tsconfig, `@/` module mapper,
ignoring `/node_modules/` and `/.next/`. `services/api` has no standalone config;
it is the `"jest"` block in `services/api/package.json:111-130`, also `node`
(`:129`).

**jsdom is not used and not installed.** The only occurrences of the string in
any config are the comments explaining its absence.

**All three frontends have a jest config and a `test` script** — web, admin and
landing. `apps/landing/jest.config.js` exists and its header records that it was
added because [[BUG-0028-country-to-currency-mapping-is-hardcoded-in-the-landing-fron]]
shipped without it; a required `test-landing` CI job runs it.

> This paragraph previously read "**`apps/landing` has no jest config and no
> `test` script.**" and listed "**9 files**" by name. Both became false and were
> corrected 2026-08-16 at `78072d2`. The named-file list is deliberately not
> reinstated — an enumeration is a snapshot that goes stale the next time
> somebody adds a spec, which is exactly how this went wrong.

Frontend spec count at `d919e1a`: **30 — web 17, admin 10, landing 3.** Count
them rather than trusting this number.

## Key abstractions

- **`apiRequest` / `apiRequestJson`** — the only sanctioned way to reach the API
  from server code; owns cookies, `X-DijiPeople-App`, trace ids, timeouts,
  refresh and error normalisation.
- **`proxyApiJsonResponse` / `proxyApiFileResponse`** — the body of nearly every
  route handler.
- **`proxy.ts`** — session freshness and login redirects, before the render.
- **`(authenticated)/layout.tsx`** — the single load point for tenant settings,
  branding, navigation, feature availability and employee context.
- **`TenantHint`** — host/query/cookie → tenant, with a reserved-label deny list.

## Known exceptions

- **The auth client header is `X-DijiPeople-App`**, not `x-auth-client-id`. The
  latter appeared in five documents and zero lines of code; those documents have
  since been corrected. The API reads `x-dijipeople-app`, falling back to
  `x-dijipeople-client` then `x-client-id`.
- **`middleware.ts` does not exist**; it is `proxy.ts`. Landing has none.
- **`api/teams/route.ts:12-14` fails open** — 200 with an empty list instead of
  403, so callers cannot distinguish "none" from "forbidden".
- **`apps/admin/lib/server-api.ts` has no timeout, no refresh mutex, no
  network-error normalisation.**
- **Admin has zero `loading.tsx` and zero `error.tsx`.**
- **`apps/web/proxy.ts:347-357` duplicates `getApiBaseUrl`** with different
  precedence than `packages/config/index.js:123-133`.
- **`app/partner/**` and `app/t/[tenantSlug]/login` are outside
  `(authenticated)`** — no shell, providers or theming.
- `apps/web/package.json` does not declare `lucide-react` despite importing it;
  it resolves only via workspace hoisting.

## Anti-patterns to avoid

1. **Making an authorization decision in a route handler.** The API is the
   authority; the two existing exceptions are the ceiling, and one (`teams`) is
   a bug pattern.
2. **Reading `tenantId` from a body, query or header in the frontend.** Take it
   from the session, as `branding-assets/route.ts:90` does.
3. **Calling `fetch` against the API directly from a server component or route
   handler** — you lose auth, refresh, timeout, trace ids and error shape.
4. **Adding an un-`.catch`-ed call to the layout's `Promise.all`** — one failing
   endpoint would blank the whole authenticated app.
5. **Creating `middleware.ts`.** It will not run. Edit `proxy.ts`.
6. **Storing a token in `localStorage`, a non-`httpOnly` cookie, or a route
   handler's JSON body.**
7. **Assuming web's `server-api.ts` hardening exists in admin.**
8. **Writing a `.test.ts` or `.tsx` test in web/admin** — `testMatch` is
   `**/*.spec.ts` on a `node` environment, so it silently will not run.

## TARGET (required going forward)

- Route handlers stay thin proxies (`apiRequest` → `proxyApi*Response`), no
  branching on identity. Any genuinely edge-level check must **fail closed**
  (403) and be enforced by the API too.
- New shell data goes into the existing `Promise.all` with its own `.catch`
  fallback and a comment naming the degraded behaviour.
- New client-identifying or tracing headers go in `buildRequestHeaders`
  (`server-api.ts:196-210`), never per call site.
- Hardening added to web's `server-api.ts` should be mirrored into admin's
  rather than left divergent.
- New env vars registered in `packages/config` validation, `turbo.json`
  `globalEnv`, `render.yaml` and `docs/environment-variables.md`.
- New reserved subdomains go in `RESERVED_HOST_LABELS`, never as an ad-hoc check.
- New pure logic in `apps/*/lib` gets a colocated `*.spec.ts` (node, `.spec.ts`).
- Correct the `X-DijiPeople-App` references in the five doc files when next
  touching them.

## What the specialist agent MUST verify before changing this

- Which app you are in — cookie prefixes, `AUTH_APP_CLIENT_ID`, `server-api.ts`
  capabilities and proxy strictness all differ.
- Read `server-api.ts:215-323` before touching the refresh path; the mutex, TTL,
  key truncation and network-error rule each fix a specific reported bug and the
  comments say which.
- Confirm a route is actually under `(authenticated)` before assuming the shell,
  providers, theme scope or session guard apply.
- Before adding a check to a route handler, confirm the Nest controller enforces
  the same rule (`@Permissions` / `@RequirePermission`).
- If you change `proxy.ts`, re-check the matcher (`:75-79`) — `/api/*` is
  excluded by design.
- If you add a header, verify no collision with the JWT `aud`/`appClientId`
  checks at `apps/web/proxy.ts:270-277`.
- Run `npm --workspace web run check-types`, `npm --workspace web run test` and
  the admin and landing equivalents. **CI exists** and runs them on push —
  `lint`, `typecheck`, `test-web`, `test-admin`, `test-landing` and `build` are
  all required jobs — but it runs on push, not on your machine, and a local pass
  is not a CI pass.
