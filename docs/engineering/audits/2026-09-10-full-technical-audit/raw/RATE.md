# RATE — Rate limiting, quotas and abuse prevention

Audit target: `agent/full-technical-audit` worktree, cut from `origin/develop` at `f55cf4b2`.
Specialist area: request-volume controls. Account-state controls (lockout mechanics,
credential handling) belong to the auth specialist; where the two meet, this report owns
the *volume* half and says so.

---

## 0. Inventory — what exists, exactly

There is **one** rate-limiting mechanism in the entire product.

| Mechanism | Present? | Evidence |
|---|---|---|
| `PublicRateLimitGuard` (bespoke, in-process) | YES | `services/api/src/common/guards/public-rate-limit.guard.ts` |
| `@nestjs/throttler` | NO | absent from `services/api/package.json`; zero source references |
| `express-rate-limit` / `rate-limiter-flexible` | NO | absent from every `package.json` |
| `helmet` | NO | absent from every `package.json` |
| Global `APP_GUARD` / `useGlobalGuards` | NO | `grep -rn "APP_GUARD\|useGlobalGuards" services/api/src` → **zero matches** |
| Next.js `middleware.ts` (any app) | NO | `find apps -name middleware.ts` → **zero files** |
| Edge rate limiting declared in repo (Render/Vercel/Cloudflare) | NO | `render.yaml` declares none; no `vercel.json`, no `wrangler.toml`, no Cloudflare config tracked |
| Per-tenant usage quotas (seats, API calls, storage) | NO | `EntitlementGuard` is feature-flag gating only — `services/api/src/common/guards/entitlement.guard.ts:14-37` |
| CAPTCHA / Turnstile / reCAPTCHA / hCaptcha | NO | zero references outside two honeypot comments |

### The one mechanism, in full

`services/api/src/common/guards/public-rate-limit.guard.ts:10-13,24-25,42-44,53-71`

```ts
const windows = new Map<string, { count: number; resetsAt: number }>();
const WINDOW_MS = 10 * 60_000;
const DEFAULT_WRITE_LIMIT = 20;
const DEFAULT_READ_LIMIT = 120;
const ROUTE_LIMITS = [{ suffix: '/auth/refresh', limit: 600 }];
...
const key = `${resolveClientIp(request)}:${request.path}`;
```

- **Key:** `(resolved client IP, full request path)` — not user, not tenant, not device.
- **Window:** fixed 10 minutes, not sliding. Counter resets wholesale.
- **Budget:** non-GET → 20; GET → 120; any path ending `/auth/refresh` → 600.
- **Storage:** module-level `Map` in the API process (§2).

Applied at exactly these places (`grep -rn "PublicRateLimitGuard" services/api/src`, excluding specs):

| Controller | Scope | Effective budget |
|---|---|---|
| `auth/auth.controller.ts` | 8 handlers | 20/10min (600 on `/auth/refresh`) |
| `auth/admin-auth.controller.ts` | 3 handlers | 20/10min |
| `agent/agent.controller.ts` | 3 handlers | 20/10min (600 on `/agent/auth/refresh` — the suffix match catches it) |
| `billing/controllers/public-billing.controller.ts` | class-level | 20 write / 120 read |
| `leads/public-leads.controller.ts` | class-level | 20/10min |
| `lookups/public-geography.controller.ts` | class-level | 120/10min |
| `partner-experience.controller.ts` | 2 classes | 20 write / 120 read |
| `contracts.controller.ts:395` (`PublicSignaturesController`) | class-level | 20 write / 120 read |
| `legal/public-legal.controller.ts` | 2 handlers | 120/10min |
| `tenants/tenants.controller.ts:23` (`signup`) | 1 handler | 20/10min |
| `attendance-integrations/gateways/gateway-service.controller.ts:126` (`pair`) | 1 handler | 20/10min |

Nothing else in 111 controllers carries any throttle.

### Client IP derivation and proxy trust

`services/api/src/common/security/client-ip.ts:26-35`

```ts
export function resolveClientIp(request: Request): string {
  if (isProxyTrusted(request)) {
    const forwarded = readForwardedForClientIp(request.headers['x-forwarded-for']);
    if (forwarded) return forwarded;
  }
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
```

`packages/config/client-ip.js:31-40` — `readForwardedForClientIp` takes `raw.split(",")[0]`, the **leftmost** entry.

`render.yaml:108-109` — `TRUST_PROXY_HEADERS: "true"` → `resolveTrustProxySetting` returns `1`
(`packages/config/forwarded-host.js:49-63`), so Express is configured for **one** trusted hop
(`services/api/src/main.ts:57-62`) and `isProxyTrusted` returns `true`.

Measured production topology (`curl -sD - https://dijipeople.onrender.com/api/health`):

```
Server: cloudflare
CF-RAY: a38ce0b89dd5fd3a-SIN
x-render-origin-server: Render
```

Two hops, not one. See RATE-01.

---

## 1. Per-surface coverage matrix

`@Public()` handler census: **38 handlers across 17 files** (script over `services/api/src`,
excluding specs). Every one is listed below.

| Surface | Route | Status | Evidence |
|---|---|---|---|
| Tenant login | `POST /api/auth/login` | COVERED 20/10min | `auth.controller.ts:73-75` |
| Workspace discovery (email+password) | `POST /api/auth/discover-workspaces` | COVERED 20/10min | `auth.controller.ts:66-67` |
| Logout | `POST /api/auth/logout` | COVERED 20/10min | `auth.controller.ts:166-167` |
| Refresh | `POST /api/auth/refresh` | COVERED 600/10min | `auth.controller.ts:99-100`; guard `:42-44` |
| Signup (self-serve tenant) | `POST /api/auth/signup` | COVERED 20/10min | `auth.controller.ts:47-48` |
| Tenant provisioning (direct) | `POST /api/tenants/signup` | COVERED 20/10min — but see RATE-13 | `tenants.controller.ts:22-27` |
| Password reset request | `POST /api/auth/forgot-password` | COVERED 20/10min | `auth.controller.ts:139-140` |
| Password reset confirm | `POST /api/auth/reset-password` | COVERED 20/10min | `auth.controller.ts:146-147` |
| Invite acceptance | `POST /api/auth/activate-account` | COVERED 20/10min | `auth.controller.ts:132-133` |
| **Invite token check** | `GET /api/auth/invitation-status` | **UNPROTECTED** | `auth.controller.ts:126-130` — `@Public()` then `@Get`, no `@UseGuards` |
| **Session profile** | `GET /api/auth/me` | **UNPROTECTED** | `auth.controller.ts:153-157` |
| Admin login | `POST /api/admin/auth/login` | COVERED 20/10min — no lockout behind it (RATE-10) | `admin-auth.controller.ts:17-19` |
| Admin password reset req/confirm | `POST /api/admin/auth/{forgot,reset}-password` | COVERED 20/10min | `admin-auth.controller.ts:41-51` |
| Agent-desktop login | `POST /api/agent/auth/login` | COVERED 20/10min — no lockout behind it (RATE-11) | `agent.controller.ts:50-52` |
| Agent refresh / logout | `POST /api/agent/auth/{refresh,logout}` | COVERED 600 / 20 | `agent.controller.ts:57-67` |
| Agent heartbeat / session start / end | `POST /api/agent/sessions/*` | UNPROTECTED (authenticated; no throttle exists for authenticated routes at all) | `agent.controller.ts:162-180` |
| Email verification / OTP send | `POST /api/public/billing/onboarding/:id/verification-code` | COVERED 20/10min **per onboardingId** + 60s server cooldown | `public-billing.controller.ts:86,251`; `owner-email-verification.service.ts:14,94-99` |
| OTP verify | `POST /api/public/billing/onboarding/:id/verify-email` | COVERED 20/10min **per onboardingId** + 5 attempts per code | `public-billing.controller.ts:271`; `owner-email-verification.service.ts:11` |
| Onboarding start | `POST /api/public/billing/onboarding` | COVERED 20/10min | `public-billing.controller.ts:86,189` |
| Subscribe / checkout | `POST /api/public/billing/subscribe` | COVERED 20/10min | `public-billing.controller.ts:86,153` |
| Onboarding status / workspace-address | `GET /api/public/billing/onboarding/:id/*` | COVERED 120/10min per id | `public-billing.controller.ts:86,209,306` |
| Public plan browsing | `GET /api/public/billing/plans`, `/commercial-config` | COVERED 120/10min | `public-billing.controller.ts:86,97,124` |
| Lead capture | `POST /api/public/leads` | COVERED 20/10min | `public-leads.controller.ts:14,19` |
| Partner enquiry | `POST /api/public/partners/inquiries` | COVERED 20/10min | `partner-experience.controller.ts:34-38` |
| Partner onboarding by token / activate | `GET,POST /api/public/partners/onboarding/:token`, `POST /activate` | COVERED 120 / 20, **per token** | `partner-experience.controller.ts:34,41-57` |
| Contact form | routed into `POST /api/public/leads` | COVERED 20/10min — **no honeypot** on `/contact` | `docs/knowledge/product/landing-website.md:73` |
| Contract e-signature session/sign/decline | `GET,POST /api/public/signatures/:token[/…]` | COVERED 120 / 20, **per token** | `contracts.controller.ts:394-427` |
| Legal document list / fetch | `GET /api/public/legal[/:slug]` | COVERED 120/10min | `public-legal.controller.ts:32-42` |
| Public geography lookup | `GET /api/public/geography/*` | COVERED 120/10min | `public-geography.controller.ts:24-31` |
| **Tenant slug / code / domain lookup** | `GET /api/public/tenants/resolve` | **UNPROTECTED** | `public-tenants.controller.ts:18-32` |
| **Tenant branding asset download** | `GET /api/public/tenants/:tenantSlug/assets/:assetType` | **UNPROTECTED** | `public-tenants.controller.ts:34-45` |
| **Hostname → workspace resolve** | `GET /api/workspaces/resolve` | **UNPROTECTED** | `tenant-domains/workspace.controller.ts:31-37` |
| **Public branding by slug** | `GET /api/tenant-settings/public-branding` | **UNPROTECTED** | `tenant-settings.controller.ts:91-95` |
| **Public branding by slug (2nd route)** | `GET /api/tenant-branding/resolved` | **UNPROTECTED** | `tenant-branding.controller.ts:28-32` |
| Stripe webhook | `POST /api/billing/stripe/webhook` | UNPROTECTED **by design** — signature-verified, 2 MB raw cap | `stripe-webhook.controller.ts:48-93`; `main.ts:157-160`; allowlisted in `public-write-rate-limit.invariant.spec.ts:36-40` |
| Release publish / promote / describe | `POST,GET /api/app-releases/publish…` | UNPROTECTED — bearer `RELEASE_PUBLISH_TOKEN` | `release-publisher.controller.ts:123-190`; allowlisted `:42-45` |
| Gateway pairing | `POST /api/integrations/gateway/pair` | COVERED 20/10min + code attempt cap | `gateway-service.controller.ts:124-127` |
| Attendance ingest from devices | `POST /api/integrations/gateway/attendance/events` | UNPROTECTED (credential-guarded); 5 000 events/request | `gateway-service.controller.ts:229-244` |
| Gateway heartbeat | `POST /api/integrations/gateway/heartbeat` | UNPROTECTED (credential-guarded) | `gateway-service.controller.ts:171-174` |
| File upload (10 endpoints) | see RATE-06 | UNPROTECTED, **and unbounded in size** | `employees/documents/attendance/timesheets/data-management/payroll/recruitment` controllers |
| File download / export | `GET …/exports/:jobId/download`, `documents/:id/view` | UNPROTECTED (authenticated) | `data-management.controller.ts:173` |
| Report generation | `GET /api/reports/*-summary` | UNPROTECTED (authenticated) | `reports.controller.ts:19-43` |
| Payroll run calculate | `POST /api/payroll/runs/:id/calculate` | UNPROTECTED, no concurrency cap (RATE-14) | `payroll-run.controller.ts:169-177` |
| Bulk import execute | `POST /api/data-management/imports/:jobId/execute` | UNPROTECTED (authenticated) | `data-management.controller.ts:204` |
| Demo-data reseed | `POST /api/admin/demo-data/reseed` | UNPROTECTED — SUPER_ADMIN only | `demo-data.controller.ts:10-29` |
| Search endpoints | none exist except `GET /api/employees/linking-search` | UNPROTECTED (authenticated) | `employees.controller.ts:168` |
| AI-backed endpoints | **none exist** | N/A | no `openai`/`anthropic`/`@ai-sdk`/`gemini` dependency in any `package.json` |

**Summary: 7 of 38 `@Public()` handlers carry no throttle at all.** Every one of the seven is a
`GET`. That is not coincidence — see RATE-02.

---

### RATE-01 — The rate-limit key is derived from an attacker-controlled header

- **Category:** Abuse prevention / bypass
- **Severity:** HIGH
- **Confidence:** LIKELY *(the unverified link is named below)*
- **Known:** NEW
- **Component:** `services/api/src/common/security/client-ip.ts`, `packages/config/client-ip.js`
- **Evidence:**

  `packages/config/client-ip.js:31-39` — the leftmost entry is taken:
  ```js
  function readForwardedForClientIp(headerValue) {
    const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const first = raw.split(",")[0];
  ```

  `services/api/src/common/security/client-ip.ts:27-31` — that value becomes the identity:
  ```ts
  if (isProxyTrusted(request)) {
    const forwarded = readForwardedForClientIp(request.headers['x-forwarded-for']);
    if (forwarded) return forwarded;
  }
  ```

  `render.yaml:108-109` — `TRUST_PROXY_HEADERS: "true"` → `resolveTrustProxySetting` returns `1`
  (`packages/config/forwarded-host.js:57-59`), i.e. **exactly one trusted hop**.

  Measured production response headers on `https://dijipeople.onrender.com/api/health`:
  `Server: cloudflare`, `CF-RAY: …-SIN`, `x-render-origin-server: Render` — **two** hops in front
  of Express, not one.

  The codebase already knows it is behind Cloudflare —
  `services/api/src/modules/billing/controllers/public-billing.controller.ts:45`:
  `"api.dijipeople.com sits behind Cloudflare, which sets cf-ipcountry from …"` — yet
  `cf-connecting-ip` and `true-client-ip` are read **nowhere** in the repository
  (`grep -rin "cf-connecting-ip\|true-client-ip"` → zero source hits).

- **Current behaviour:** With `trust proxy = 1`, Express's own `req.ip` would take the entry one
  hop from the right — the correct, proxy-written value. `resolveClientIp` ignores the configured
  hop count entirely and takes the leftmost entry, which is the *first* value in the chain and
  therefore whatever the original caller supplied. Cloudflare's documented behaviour is to
  **append** the connecting IP to an existing `X-Forwarded-For` rather than replace it, so the
  chain arriving at Express is `<attacker string>, <real client>, <edge>` and the guard keys on
  `<attacker string>`.
- **Expected behaviour:** Behind a known edge, the client IP comes from the edge's own
  non-forgeable header (`CF-Connecting-IP`), or from the chain indexed by the configured hop count
  from the right — never from the leftmost entry of an appendable header.
- **Risk:** Every rate limit in the product becomes decorative. One host can issue unlimited
  login attempts, unlimited tenant-signup calls, unlimited lead submissions and unlimited
  password-reset requests by rotating a header value, with no botnet and no cost. It also inverts:
  an attacker can *forge somebody else's* address and exhaust their budget, denying service to a
  specific customer's office IP.
- **The unverified link:** I did not execute a request-volume probe against production (the audit
  brief forbids writes, and every rejected request writes a database row — see RATE-04). The
  single unverified claim is that Cloudflare/Render preserve a client-supplied `X-Forwarded-For`
  prefix rather than replacing it. Everything else — that the code reads the leftmost entry, that
  the hop count is configured and then ignored, that `CF-Connecting-IP` is never read, that the
  edge is Cloudflare — is CONFIRMED.
- **Remediation:** In `resolveClientIp`, read `cf-connecting-ip` first when present (Cloudflare
  strips and rewrites it on every request, so it cannot be spoofed through the edge), falling back
  to indexing the `X-Forwarded-For` chain **from the right** by the configured hop count. Set
  `TRUST_PROXY_HEADERS: "2"` in `render.yaml` to describe the real Cloudflare→Render topology.
  Add a spec asserting that a request whose `X-Forwarded-For` is `1.2.3.4, 203.0.113.9` with two
  trusted hops resolves to neither `1.2.3.4` nor the socket address.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM — changes which bucket existing traffic lands in; the same function
  feeds `apps/web` tenant routing, so verify workspace resolution simultaneously.
- **Fix now:** YES

---

### RATE-02 — The rate-limit invariant covers writes only; every unprotected public surface is a read

- **Category:** Abuse prevention / coverage
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW *(the invariant is ITEM-0013, DONE; the read-side gap is not recorded)*
- **Component:** `services/api/src/common/guards/public-write-rate-limit.invariant.spec.ts`
- **Evidence:**

  `public-write-rate-limit.invariant.spec.ts:48` — the invariant's own definition of scope:
  ```ts
  const WRITE_DECORATOR = /@(Post|Put|Patch|Delete)\s*\(/;
  ```
  `@Get` is absent. The check therefore passes for any unthrottled public read, now and forever.

  The seven `@Public()` handlers with no guard, all of them `GET`:
  - `auth.controller.ts:126-130` — `@Public() @Get('invitation-status')`
  - `auth.controller.ts:153-157` — `@Public() @Get('me')`
  - `tenants/public-tenants.controller.ts:18-32` — `@Public() @Get('resolve')`
  - `tenants/public-tenants.controller.ts:34-45` — `@Public() @Get(':tenantSlug/assets/:assetType')`
  - `tenant-domains/workspace.controller.ts:31-37` — `@Public() @Get('resolve')`
  - `tenant-settings/tenant-settings.controller.ts:91-95` — `@Public() @Get('public-branding')`
  - `tenant-settings/tenant-branding.controller.ts:28-32` — `@Public() @Get('resolved')`

  For contrast, the guard's own comment at
  `lookups/public-geography.controller.ts:20-23` states the rule the invariant does not enforce:
  *"Rate limited like every other public endpoint. A country list is cheap, but it is also the sort
  of endpoint that gets scraped in a loop."*

- **Current behaviour:** A new `@Public() @Get(…)` handler ships with no throttle and no check
  fails. Five of the seven above stream a database read; one streams a file off disk.
- **Expected behaviour:** The invariant that exists for `@Post/@Put/@Patch/@Delete` covers `@Get`
  too, with an explicit allowlist entry for any read deliberately left open.
- **Risk:** Unlimited scraping, unlimited enumeration (RATE-09), unlimited DB load and unlimited
  error-log row creation (RATE-04) from an unauthenticated caller — with nothing in CI that will
  ever notice a new one being added.
- **Remediation:** Widen `WRITE_DECORATOR` in
  `services/api/src/common/guards/public-write-rate-limit.invariant.spec.ts` to
  `/@(Get|Post|Put|Patch|Delete)\s*\(/` and rename the suite. Apply
  `@UseGuards(PublicRateLimitGuard)` **at class level** to `PublicTenantsController` and
  `WorkspaceController`, and per-handler to the four `@Public()` reads living on otherwise-guarded
  controllers. Budgets: `120/10min per (IP, path)` is right for branding and `auth/me`;
  `/public/tenants/resolve` needs a **tighter** budget than the default read — `30 per 10 min per
  IP across the whole route** (see RATE-09), because a legitimate browser calls it once per login
  page load and an enumerator calls it once per candidate slug.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### RATE-03 — No authenticated endpoint in the product is rate limited at all

- **Category:** Abuse prevention / coverage
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** whole API
- **Evidence:**

  `grep -rn "APP_GUARD\|useGlobalGuards" services/api/src` → **zero matches**. There is no global
  guard; a route is protected only by what its own controller declares.

  `PublicRateLimitGuard` is declared on 13 controllers/handlers (table in §0). None of them is an
  authenticated surface. `apps/web/lib/forwarded-headers.invariant.spec.ts:24-30` states the same
  fact from the other side:
  > *"Handlers that go through `server-api.ts` are **not** covered … the endpoints it reaches are
  > authenticated and `PublicRateLimitGuard` does not run on them."*

- **Current behaviour:** Any user holding a valid session — including the lowest-privileged
  employee of any tenant, and including a session obtained from a free self-serve signup
  (RATE-13) — can issue unlimited requests per second to any of ~111 controllers. Nothing counts,
  nothing sheds load, nothing alerts.
- **Expected behaviour:** A per-session or per-user ceiling that is far above legitimate use and
  far below what saturates a single 0.5-vCPU instance, plus tighter ceilings on the handful of
  endpoints that trigger heavyweight work.
- **Risk:** One authenticated account can saturate the single API instance and take the platform
  down for every tenant. Combined with RATE-13 (free unauthenticated tenant creation) the attacker
  does not even need a customer relationship. Combined with RATE-06 and RATE-14 the cost per
  request is seconds of CPU, not milliseconds.
- **Remediation:** Add a second guard, `AuthenticatedRateLimitGuard`, in
  `services/api/src/common/guards/`, applied globally through `APP_GUARD` in `app.module.ts` so it
  cannot be forgotten. Key on `(userId, endpoint-class)` where endpoint-class is one of three:
  - **read** — `600 per minute per user`. A busy runtime list screen issues ~20 requests; 600 is
    30× that and still 10/s.
  - **write** — `120 per minute per user`. Above any human form-submission rate, below a script.
  - **expensive** — declared by a `@Expensive()` decorator on payroll calculate, export queue,
    import execute, report generation and bulk operations: `10 per minute per tenant` and
    `2 concurrent per tenant` (see RATE-14).
  Return `429` with `Retry-After`, and — critically — take the rejection path *before*
  `ErrorLogsService.persist` (RATE-04).
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM — a too-tight read budget breaks dashboard fan-out; ship it in
  log-only mode for one release and read the observed p99 before enforcing.
- **Fix now:** YES

---

### RATE-04 — Every rejected request writes a database row, so throttling costs more than serving

- **Category:** Abuse prevention / resource exhaustion
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW *(adjacent: BUG-1754 on triage-queue pollution, BUG-0976 on CORS 500s)*
- **Component:** `services/api/src/common/filters/http-exception.filter.ts`, `modules/error-logs/error-logs.service.ts`
- **Evidence:**

  `http-exception.filter.ts:118-124` — persistence is unconditional on status code:
  ```ts
  if (normalized.statusCode >= 500) { this.logger.error(...); } else { this.logger.warn(...); }
  await this.errorLogsService.persist({ ... });
  ```

  `error-logs.service.ts:76-78` — enabled by default:
  ```ts
  const config = getErrorFrameworkConfig(this.configService);
  if (!config.enabled || config.storage !== 'database') return;
  ```
  `common/errors/error-config.ts:20-25` — `enabled` defaults `true`, `storage` defaults
  `'database'`, `retentionDays` defaults `90`.

  `error-logs.service.ts:112-167` — the incident is deduped by fingerprint, but the **occurrence
  is not**:
  ```ts
  await this.prisma.$transaction(async (tx) => {
    const existing = await tx.errorLog.findUnique({ where: { fingerprint } });
    ...
    await tx.errorLogOccurrence.upsert({
      where: { traceId: data.traceId },
      update: {},
      create: { incidentId: incident.id, traceId: data.traceId, diagnosticJson: ... },
    });
  });
  ```
  `traceId` is unique per request, so `upsert` is always an insert. One new row, carrying a full
  JSON diagnostic blob, **per rejected request**.

  `http-exception.filter.ts:293` — `429` is itself mapped into the catalog
  (`if (statusCode === 429) return 'RATE_LIMIT_EXCEEDED';`) and therefore goes down the same
  persistence path.

  `error-logs.service.ts:286-290` — the retention sweep deletes `errorLog` rows older than the
  cutoff; there is no cap on rows accumulated *within* the 90-day window.

- **Current behaviour:** Hitting the rate limit is more expensive for the server than not hitting
  it: a `429` costs a `$transaction` with a `findUnique`, an `update` and an `insert`, where the
  allowed request that preceded it may have cost a single indexed read. The same is true of every
  `401` from an expired session, every `404` on an unmatched route, and every `400` from the
  validation pipe.
- **Expected behaviour:** Rejections that carry no diagnostic value — `429`, `401` on an expired
  token, `404` on an unmatched route, `400` from schema validation on an unauthenticated
  endpoint — are counted, not stored per-occurrence.
- **Risk:** Unbounded, unauthenticated write amplification against the production Neon database.
  An attacker aiming at `GET /api/public/tenants/resolve?slug=<random>` (unthrottled, RATE-09)
  writes one row per request at line rate for 90 days of retention; at 100 req/s that is 8.6M
  occurrence rows per day, each with a JSON blob. This costs storage, it costs Neon compute, and
  it buries genuine incidents — which is precisely the failure BUG-1754 already recorded once at a
  scale of 1 588 rows.
- **Remediation:** In `ErrorLogsService.persist`, add a suppression set checked before the
  transaction: skip `errorLogOccurrence` creation (keeping the incident counter increment) when
  `statusCode` is `429`, or when `unmatchedRoute` is true, or when `errorCode` is
  `AUTH_UNAUTHORIZED` on a `@Public()` route. Additionally, cap occurrences per incident — after
  the first 100 occurrences of a fingerprint within a window, increment `occurrenceCount` only.
  Make `PublicRateLimitGuard`'s `429` bypass the filter entirely by writing the response directly
  rather than throwing.
- **Difficulty:** LOW
- **Regression risk:** LOW — `occurrenceCount` still records the volume.
- **Fix now:** YES

---

### RATE-05 — One unauthenticated login request costs ~1.1 s of CPU on a single-instance API

- **Category:** Resource exhaustion
- **Severity:** HIGH
- **Confidence:** CONFIRMED *(measured)*
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`, `modules/agent/agent.service.ts`
- **Evidence:**

  `services/api/package.json:73` — `"bcryptjs": "^3.0.3"` — the **pure-JavaScript** implementation,
  not native `bcrypt`. It runs on the Node process's own CPU.

  Cost factor 12 is used for every credential hash and therefore every comparison against one:
  `auth.service.ts:524` and `user-invitations.service.ts:239` — `bcrypt.hash(password, 12)`.

  Measured on this machine (`node -e` against the installed `bcryptjs`, primary checkout):
  ```
  hash12ms 1174   cmp12ms 1133   cmp10ms 453
  ```
  **1.13 seconds of CPU per cost-12 comparison** on a modern developer laptop.

  The cost is paid even for addresses that do not exist —
  `agent.service.ts:192-198`:
  ```ts
  if (!user) {
    if (candidates.length === 0) {
      await bcrypt.compare(dto.password, TIMING_EQUALISATION_HASH);
    }
  ```
  and it is paid *per candidate* when one address exists in several tenants —
  `agent.service.ts:175-190`:
  ```ts
  const candidates = await this.prisma.user.findMany({ where: { email }, ... });
  for (const candidate of candidates) {
    if (await bcrypt.compare(dto.password, candidate.passwordHash)) { user = candidate; break; }
  ```
  with no cap on `candidates.length`.

  `render.yaml:5` — `plan: starter`. `render.yaml:48-51` states the consequence directly:
  > *"a Render disk pins this service to a **SINGLE INSTANCE** … `starter` runs one instance."*

- **Current behaviour:** The whole platform is served by one Node process on a `starter` instance.
  Each unauthenticated `POST /api/auth/login` or `POST /api/agent/auth/login` consumes ≥1 s of that
  process's CPU — considerably more than 1 s on a shared 0.5-vCPU container. The only control is
  20 requests per 10 minutes per `(IP, path)`, and that key is forgeable (RATE-01).
- **Expected behaviour:** The cost of an unauthenticated request is bounded well below the cost of
  making it, or the hashing runs off the request thread.
- **Risk:** Concrete arithmetic: 600 requests inside a 10-minute window ≈ 600 CPU-seconds against
  a 600-second wall clock on one core — the API is at 100 % and every tenant's every request
  queues behind it. 600 requests needs 30 source addresses under the current limit, or **zero**
  extra addresses if RATE-01 holds. This is a single-laptop denial of service against the entire
  platform.
- **Remediation:** Three changes, in order of value:
  1. Replace `bcryptjs` with the native `bcrypt` binding (or `@node-rs/bcrypt`), which runs on
     libuv's threadpool and is ~10× faster — CPU per comparison drops to ~100 ms and it stops
     blocking the event loop.
  2. Cap the agent-login candidate loop at 5 comparisons
     (`agent.service.ts:175`, add `take: 5`), so one address present in many tenants cannot
     multiply the cost.
  3. Add an **endpoint-class concurrency limiter**: at most **4 concurrent bcrypt comparisons
     process-wide**, queued, with a 2-second queue timeout returning `503`. Four, because that is
     roughly the point at which a 0.5-vCPU container is saturated and everything beyond it is
     queueing anyway — better to shed it explicitly than to stall the event loop.
- **Difficulty:** MEDIUM (native `bcrypt` needs a build step in the Render image; `@node-rs/bcrypt`
  ships prebuilt binaries and avoids that)
- **Regression risk:** MEDIUM — existing hashes are format-compatible across implementations, but
  verify against a production hash before shipping.
- **Fix now:** YES

---

### RATE-06 — Ten file-upload endpoints have no size limit; multer buffers the whole body in memory

- **Category:** Resource exhaustion
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** ten controllers across `employees`, `documents`, `attendance`, `timesheets`, `data-management`, `payroll`, `recruitment`
- **Evidence:**

  Express body limits do not apply to `multipart/form-data`. `main.ts:130-144` caps JSON at 1 MB
  (25 MB for DLP, 10 MB for platform email templates, 2 MB raw for Stripe) — none of which the
  multipart parser consults.

  `FileInterceptor` with **no `limits` option** — multer's default file size is `Infinity`, and its
  default storage is memory:

  | File | Line | Endpoint |
  |---|---|---|
  | `employees/employees.controller.ts` | 147 | `POST /api/employees/import` |
  | `employees/employees.controller.ts` | 590 | `POST /api/employees/:id/documents/upload` |
  | `employees/employees.controller.ts` | 608 | `PATCH /api/employees/:id/documents/:docId` |
  | `employees/employees.controller.ts` | 695 | `POST /api/employees/:id/profile-image/upload` |
  | `documents/documents.controller.ts` | 139 | `POST /api/documents/upload` |
  | `attendance/attendance.controller.ts` | 290 | `POST /api/attendance/import` |
  | `timesheets/timesheets.controller.ts` | 407 | `POST /api/timesheets/template/import/preview` |
  | `data-management/data-management.controller.ts` | 133 | `POST /api/data-management/modules/:key/imports/analyse` |
  | `payroll/payroll-operations.controller.ts` | 237 | `POST …/import-results` |
  | `payroll/payroll-operations.controller.ts` | 251 | `POST …/import-results/preview` |
  | `recruitment/candidates.controller.ts` | 100 | candidate document upload |

  Only four endpoints declare a limit — `contracts.controller.ts:85,97`
  (`limits: { fileSize: 10 * 1024 * 1024 }`), `support-cases.controller.ts:99`, and
  `tenant-settings.controller.ts:60` (`MAX_BRANDING_ASSET_BYTES` = 3 MB,
  `branding-assets.service.ts:48`).

  Where a size check exists at all it runs **after** the buffer is already in memory:
  `employees/employee-profiles.service.ts:2058` — `if (file.size > this.storageService.getMaxUploadBytes())`;
  `documents.service.ts:761` — same shape. `file.size` is only knowable once multer has written
  every byte.

  `POST /api/employees/import` has no check at any layer. `common/utils/csv.util.ts:107-123` —
  `assertCsvUpload` validates mimetype and filename only:
  ```ts
  if (!CSV_MIME_TYPES.includes(file.mimetype) && !file.originalname.toLowerCase().endsWith('.csv')) {
    throw new Error(`${entityLabel} import supports CSV files only.`);
  }
  return file;
  ```
  and `employees.service.ts:1729-1730` then doubles the footprint:
  ```ts
  const validated = assertCsvUpload(file, 'Employee');
  rows = parseCsvRows(validated.buffer.toString('utf8'), 'Employee');
  ```
  `csv.util.ts:126-134` — `parseCsvRows` splits every line into an unbounded array. There is no
  row cap on this path (the `data-management` path does have one:
  `import-analysis.service.ts:41-43`, `MAX_FILE_BYTES = 25 MB`, `MAX_ROWS = 20 000`).

  `render.yaml:5,48-51` — single `starter` instance.

- **Current behaviour:** An authenticated user holding `employees.create` posts a 1 GB multipart
  body to `/api/employees/import`. Multer buffers all of it in the Node heap, `.toString('utf8')`
  allocates another copy, and `parseCsvRows` allocates an array of every line. The instance OOMs
  before any validation runs.
- **Expected behaviour:** The size limit is enforced by the parser, so the connection is aborted
  at the threshold and the bytes are never allocated.
- **Risk:** One authenticated tenant user kills the single process serving **every** tenant. It
  also removes the platform's only writer, so in-flight payroll and attendance work is lost. The
  permission needed (`employees.create`, `documents.upload`, `attendance.import`) is held by
  ordinary HR staff, not just administrators.
- **Remediation:** Add `limits` to all ten interceptors. Sizes, with reasons:
  - CSV/XLSX imports (`employees`, `attendance`, `timesheets`, `payroll` results): **10 MB**,
    which at ~200 bytes per employee row is ~50 000 rows — an order of magnitude above the largest
    plausible tenant.
  - Documents and candidate attachments: **`StorageService.getMaxUploadBytes()`**, already 10 MB
    by default (`storage.service.ts:12-16`) — pass it into the interceptor rather than checking it
    afterwards.
  - Profile images: **2 MB**.
  Then add a row cap to `parseCsvRows` mirroring `MAX_ROWS = 20 000`, and register a
  `MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } })` default in
  `app.module.ts` so a future interceptor added without options inherits a bound rather than
  `Infinity`.
- **Difficulty:** LOW
- **Regression risk:** LOW — verify no tenant currently uploads over the chosen caps.
- **Fix now:** YES

---

### RATE-07 — The limiter's counter is process memory: it resets on deploy and is unbounded under key rotation

- **Category:** Abuse prevention / storage
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/common/guards/public-rate-limit.guard.ts`
- **Evidence:**

  `public-rate-limit.guard.ts:10` — module-level, in-process:
  ```ts
  const windows = new Map<string, { count: number; resetsAt: number }>();
  ```

  `:56-59,74-78` — cleanup runs **only** on the new-or-expired-key branch, and only evicts already
  expired entries:
  ```ts
  if (!current || current.resetsAt <= now) {
    windows.set(key, { count: 1, resetsAt: now + WINDOW_MS });
    this.cleanup(now);
    return true;
  }
  ...
  private cleanup(now: number) {
    if (windows.size < 5_000) return;
    for (const [key, value] of windows) if (value.resetsAt <= now) windows.delete(key);
  }
  ```

  `render.yaml:5,48-51` — `plan: starter`, pinned to a single instance by the attached disk.

- **Deployed instance count: one.** So the in-process counter is *correct today* — there is no
  second instance to disagree with it. The consequences that do bite:
  1. **Every deploy resets every counter.** `preDeployCommand` runs the full release chain
     (`render.yaml:38`), so deploys are frequent; each one hands every rate-limited caller a fresh
     budget.
  2. **Unbounded growth under key rotation.** A caller supplying a distinct
     `X-Forwarded-For` per request (RATE-01) creates a distinct key per request. None of them is
     expired inside the 10-minute window, so `cleanup` deletes nothing while the map grows. At
     ~120 bytes per entry, 1 M distinct keys ≈ 120 MB on a container with limited headroom.
  3. **O(n) scan per request.** Once `windows.size ≥ 5 000`, every new key triggers a full
     iteration of the map. With 1 M entries that is a million-iteration synchronous scan on the
     event loop *per request*, which is a CPU DoS in its own right, independent of the memory.
- **Expected behaviour:** The counter store is bounded by construction and its eviction is O(1)
  amortised.
- **Risk:** Memory and CPU exhaustion of the single API process, reachable without authentication,
  as a side effect of the control that is meant to prevent exactly that.
- **Remediation:** Do **not** reach for Redis yet — one instance does not need shared state, and
  adding a network hop to the hot path of every public request buys nothing today. Instead:
  - Cap `windows` at a hard maximum (**50 000 entries** — ~6 MB, and far above any plausible count
    of genuine distinct client IPs in a 10-minute window for this traffic level) with LRU
    eviction, so growth is bounded whatever the key space.
  - Replace the O(n) scan with a bucketed sweep: keep two maps, swap them every `WINDOW_MS`, and
    drop the stale one — O(1) per request, no scanning.
  - **The trigger for moving to Redis is `numInstances > 1`.** That is gated on removing the
    Render disk (`render.yaml:48-51` already records that the disk pins the service to one
    instance), so the two decisions are the same decision. When it is taken, the limiter store
    must move at the same time or the effective budget silently multiplies by the instance count.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER *(the LRU cap is worth doing with RATE-01; the two-map sweep can follow)*

---

### RATE-08 — The key includes the full path, so any id in the URL grants a fresh budget

- **Category:** Abuse prevention / design
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/common/guards/public-rate-limit.guard.ts:53`
- **Evidence:**

  `public-rate-limit.guard.ts:53` — the raw path, not the route pattern:
  ```ts
  const key = `${resolveClientIp(request)}:${request.path}`;
  ```
  Nest's route pattern (`/public/signatures/:token/sign`) is available on the execution context and
  is not used.

  Public routes carrying a path parameter, each of which therefore gets its own independent
  budget per value:
  - `POST /api/public/billing/onboarding/:onboardingId/verify-email` (20 per id)
  - `POST /api/public/billing/onboarding/:onboardingId/verification-code` (20 per id)
  - `GET /api/public/billing/onboarding/:onboardingId/{status,workspace-address}` (120 per id)
  - `GET,POST /api/public/signatures/:token[/sign|/decline|/request-changes]` (120 / 20 per token)
  - `GET,POST /api/public/partners/onboarding/:token` (120 / 20 per token)
  - `GET /api/public/legal/:slug` (120 per slug)

- **Current behaviour:** There is **no aggregate per-IP cap anywhere in the product**. A caller
  iterating path parameters draws an unbounded total request volume from the API while never
  exceeding any single bucket. The signing and partner tokens are 256–320 bits
  (`contracts.service.ts:3233,3525`, `partner-experience.service.ts:465,746` —
  `randomBytes(32|40|48).toString('base64url')`) so this is not a token-brute-force risk; it is a
  volume risk, and it means the limiter cannot function as a load-shedding control.
- **Expected behaviour:** Two dimensions, not one: a per-`(IP, route-pattern)` budget for
  endpoint-specific abuse, **and** a per-`IP` aggregate ceiling across all public routes.
- **Risk:** Load-shedding does not work. The mitigations that other parts of the codebase rely on
  ("it is rate limited") do not hold for any route with an id in it — including
  `public-billing.controller.ts:200-205`, which explicitly reasons that binding slug availability
  to an onboarding session is safe because *"a caller must first create a rate-limited … order"*.
- **Remediation:** In `PublicRateLimitGuard.canActivate`, build the key from the Nest route
  pattern rather than `request.path` (available via `context.switchToHttp().getRequest().route?.path`),
  so all values of `:token` share one bucket. Then add a second, coarser counter keyed on the IP
  alone: **300 requests per 10 minutes per IP across every public route combined** — five times the
  most generous single-route read budget, comfortably above a browser loading a subscribe wizard,
  and far below a scraper.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM — collapsing per-token buckets means one noisy signer can now
  exhaust the shared signature budget; size the per-pattern write budget up to 60 when making this
  change.
- **Fix now:** YES

---

### RATE-09 — `GET /api/public/tenants/resolve` is an unlimited tenant-existence oracle

- **Category:** Enumeration
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/tenants/public-tenants.controller.ts`
- **Evidence:**

  `public-tenants.controller.ts:14-32` — no guard of any kind on the controller or the handler:
  ```ts
  @Controller('public/tenants')
  export class PublicTenantsController {
    @Public()
    @Get('resolve')
    resolve(@Query('slug') slug?, @Query('domain') domain?, @Query('host') host?, @Query('tenantCode') tenantCode?) {
  ```

  `public-tenants.service.ts:92-104` — the two outcomes are trivially distinguishable:
  ```ts
  if (!tenant) {
    throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Tenant was not found.', details: normalizedInput });
  }
  ```
  A hit returns 200 with the tenant's `brandName`, `loginTitle`, colours and slug
  (`mapResolvedTenant`, `DEFAULT_BRANDING` at `:36-53` shows the shape).

  `public-tenants.service.ts:119-121,126-128` — indexed unique lookups, so each probe is cheap for
  the attacker and cheap-but-nonzero for the database:
  ```ts
  return this.prisma.tenant.findUnique({ where: { slug: normalizedSlug }, include: publicTenantInclude });
  ...
  return this.prisma.tenant.findUnique({ where: { tenantCode: input.tenantCode.toUpperCase() }, ... });
  ```

  **Only hits are cached.** `public-tenants.service.ts:93-104` throws before reaching
  `this.cache.set` at `:109`, so every *miss* — i.e. every enumeration probe — is a fresh database
  round trip and a fresh `ErrorLogOccurrence` insert (RATE-04).

  The same repository deliberately protects against exactly this elsewhere —
  `public-billing.controller.ts:200-205`:
  > *"`GET /public/workspace-slug?value=maseer` — is a tenant-existence oracle: walk a list of
  > company names and the 'taken' answers map DijiPeople's customer base. Requiring a live
  > onboarding session means a caller must first create a rate-limited, durably recorded order."*

- **Current behaviour:** The mitigation designed for the onboarding slug check is entirely bypassed
  by a sibling endpoint that answers the same question with no session, no throttle and no record.
- **Quantified:** unthrottled and unauthenticated. At a conservative 50 req/s a caller tests
  4.3 M candidate slugs per day; a curated list of the Gulf's 50 000 registered companies is
  exhausted in under 20 minutes. The answer includes the tenant's brand name and login copy, so
  the output is a customer list, not just a yes/no.
- **Risk:** DijiPeople's entire customer base is enumerable by a competitor or a targeted
  attacker, who then knows exactly which workspace hostnames to point credential-stuffing at.
  Each probe additionally writes a database row (RATE-04) and burns a database round trip.
- **Remediation:** Apply `@UseGuards(PublicRateLimitGuard)` at class level on
  `PublicTenantsController` and add a route override in
  `public-rate-limit.guard.ts:42-44` of **30 per 10 minutes per IP** for
  `/public/tenants/resolve` — a login page calls it once, a workspace switcher a handful of times,
  so 30 is ~10× legitimate use and 0.05 req/s for an enumerator. Additionally, **cache the miss**:
  `PublicTenantCacheService` should store a negative result for the configured TTL so repeated
  probes for the same absent slug do not reach Postgres. Do the same for
  `GET /api/workspaces/resolve`, which answers the same question by hostname
  (`workspace.controller.ts:31-37`).
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### RATE-10 — Admin and platform-admin login have no account lockout; the IP budget is the only control

- **Category:** Brute force
- **Severity:** MEDIUM *(HIGH if RATE-01 holds)*
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth.service.ts`
- **Evidence:**

  `grep -rn "registerFailure\|loginLockoutService" services/api/src` returns matches in exactly one
  method — `auth.service.ts:1369,1407,1438`, inside the tenant `login` path. Neither admin path
  appears.

  `auth.service.ts:1446-1477` — `validateAdminCredentials`: a loop of `bcrypt.compare` with **no**
  lockout check, **no** failure registration, **no** counter:
  ```ts
  for (const user of adminCandidates) {
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) { continue; }
    return user;
  }
  ...
  throw this.authUnauthorized('ADMIN_AUTH_INVALID_CREDENTIALS', 'Invalid admin credentials.');
  ```

  `auth.service.ts:1479-1520` — `validatePlatformAdminCredentials`, the **platform super-admin**
  path, is the same shape:
  ```ts
  const user = await this.prisma.platformUser.findUnique({ where: { email: normalizedEmail } });
  ...
  const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
  if (!isPasswordValid) { this.logger.warn(...); throw this.authUnauthorized(...); }
  ```
  No `lockedUntil`, no `failedLoginAttempts`, no cooldown.

  `admin-auth.controller.ts:17-19` — the only control is
  `@UseGuards(PublicRateLimitGuard)` = 20 attempts per 10 minutes per `(IP, path)`.

- **Current behaviour:** The credential guarding cross-tenant platform administration — the
  account that can read and write every tenant's data — is protected against guessing by a per-IP
  request budget alone. `render.yaml:127-129` shows this account's email is a deployment variable
  and therefore predictable in shape.
- **Quantified:** 20 guesses / 10 min / IP = 2 880 per day per source address. A 500-node
  residential proxy pool yields 1.44 M guesses/day against one known email, unbounded in time,
  with no account state that ever says "stop". If RATE-01 holds, one host achieves the same.
- **Risk:** Platform-wide compromise. Every tenant's data is behind this one password.
- **Remediation:** Wire `LoginLockoutService` into `validateAdminCredentials`, and add the
  equivalent columns and calls for `PlatformUser` in `validatePlatformAdminCredentials`.
  Thresholds: **5 failures → 30-minute lock** for tenant admins (matching
  `login-lockout.service.ts:21-22`), and **3 failures → 60-minute lock** for platform users,
  because the blast radius is the whole platform and the population of legitimate platform users
  is single digits, so a tighter threshold costs almost nothing in support load. Emit a
  `PlatformEventsService` event on every platform-admin lock so it is visible rather than silent.
- **Difficulty:** MEDIUM — `PlatformUser` needs a migration for the two columns.
- **Regression risk:** LOW
- **Fix now:** YES *(route the mechanism half to the auth specialist; the volume analysis is here)*

---

### RATE-11 — Agent-desktop login is a cross-tenant credential oracle with no account lockout

- **Category:** Brute force / credential stuffing
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** KNOWN (BUG-0033 — the enumeration half is fixed; the lockout gap is not recorded)
- **Component:** `services/api/src/modules/agent/agent.service.ts`
- **Evidence:**

  `agent.controller.ts:50-55` — `@Public() @UseGuards(PublicRateLimitGuard) @Post('auth/login')`.
  20 per 10 min per `(IP, path)` is the entire control.

  `agent.service.ts:174-190` — the lookup is deliberately **tenant-free**, so this one endpoint
  reaches every account on the platform:
  ```ts
  const email = dto.email.trim().toLowerCase();
  const candidates = await this.prisma.user.findMany({ where: { email }, include: { tenant: true, employee: true } });
  for (const candidate of candidates) {
    if (await bcrypt.compare(dto.password, candidate.passwordHash)) { user = candidate; break; }
  ```
  Neither `LoginLockoutService` nor `registerIdentityFailure` is called anywhere in this file —
  the whole `login` method has no failure bookkeeping. The tenant path's protections
  (`auth.service.ts:1369,1407`) do not apply.

- **Current behaviour:** BUG-0033 closed the enumeration oracle (uniform message, timing
  equalisation, deterministic candidate selection — `agent.service.ts:152-198`) and added the rate
  limit. It did **not** add account lockout. So the per-account counter that stops password
  guessing on `/api/auth/login` after 5 attempts does not exist here, and an attacker who prefers
  this endpoint gets a slower but **unbounded** guessing surface against every account on the
  platform, needing no tenant slug.
- **Quantified:** 20 guesses / 10 min / IP against *any* account on the platform, unbounded in
  total because nothing accumulates on the account. The tenant login path caps a single account at
  5 wrong passwords ever-per-30-minutes; this path caps nothing.
- **Risk:** Credential stuffing against a leaked password list is bounded only by source-address
  count, and each success yields an agent-desktop session with a **90-day refresh token**
  (`common/config/auth.config.ts:22` — `agentRefreshTtl: '90d'`).
- **Remediation:** Call `LoginLockoutService.isLocked` / `registerFailure` / `registerSuccess` in
  `AgentService.login`, using the resolved candidate. Where no candidate matches, register the
  failure against the *email* rather than a user — add an `Identity`-keyed counter reusing
  `registerIdentityFailure` (`users/identity.service.ts:211`). Threshold **5 failures →
  30-minute lock**, matching the tenant path so an attacker cannot pick the softer door. Cap
  `findMany` with `take: 5` (also RATE-05).
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM — a shared kiosk device could lock a legitimate employee out; the
  lock must be per-account, not per-device.
- **Fix now:** YES

---

### RATE-12 — Five unauthenticated requests lock any known account out for 30 minutes

- **Category:** Availability / abuse
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** KNOWN (ITEM-0069 — resolved for `/auth/discover-workspaces`; its own acceptance
  criterion for `/auth/login` was not met)
- **Component:** `services/api/src/modules/auth/auth.service.ts`, `modules/auth/login-lockout.service.ts`
- **Evidence:**

  `login-lockout.service.ts:21-22` — `DEFAULT_ATTEMPTS_BEFORE_LOCK = 5`, `DEFAULT_LOCK_MINUTES = 30`.

  `auth.service.ts:1407` — the failure is registered on the *account*, from a `@Public()` endpoint:
  ```ts
  if (!isPasswordValid) {
    await this.loginLockoutService.registerFailure(user);
  ```

  `ITEM-0069`'s acceptance criteria, verbatim:
  > *"Whatever is chosen also applies to `/auth/login`, which has the same shape."*

  and its resolution note:
  > *"**Separation, not removal.** Discovery has its own counter now: `Identity.discoveryFailedAttempts`
  > and `discoveryBlockedUntil` … Exhausting it blocks *discovery*; the credential lock is
  > untouched."*

  `grep -rn "discoveryFailedAttempts" services/api/src` shows the separation applies to discovery
  only; `auth.service.ts:1407` still increments the credential counter from the public login route.

- **Current behaviour:** Anyone who knows an employee's email and their tenant slug can lock that
  employee out of their workspace for 30 minutes with 5 requests, repeatable indefinitely. The
  per-IP budget of 20 writes per 10 minutes permits **4 accounts locked per IP per 10 minutes**
  = 24 accounts/hour/IP. With RATE-01, unbounded.
- **Expected behaviour:** The trade-off documented in `login-lockout.service.ts:12-18` (account
  counter beats IP counter, because IPs rotate) is correct, but it needs the mitigation
  ITEM-0069 chose for discovery: a separate counter for the unauthenticated path, or at minimum a
  notification so the victim knows.
- **Risk:** Targeted denial of service against named individuals — a payroll approver on payday, a
  manager during an approval window. Silent: nothing notifies the account holder
  (`login-lockout.service.ts:104-113` logs a warning server-side and stops there).
- **Remediation:** Apply ITEM-0069 option 3 first, since it is cheap and prevents nothing being
  invisible: emit an `AUTH_ACCOUNT_LOCKED` notification through the `notifications` module when
  `shouldLock` fires in `login-lockout.service.ts:104`. Then apply option 1 to
  `/auth/login`: hold unauthenticated login failures in a separate counter with a **higher**
  threshold (**15 failures → 15-minute block on that (email, IP) pair**) and only promote to the
  account lock when failures arrive from **three or more distinct source addresses**, which is the
  signature of an actual attack rather than a griefer.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM — weakens per-account protection unless the multi-source promotion
  is implemented correctly; needs a spec.
- **Fix now:** LATER *(the notification half is LOW effort and should ship now)*

---

### RATE-13 — Unauthenticated tenant provisioning at 20 tenants per IP per 10 minutes

- **Category:** Resource exhaustion / abuse
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/tenants/tenants.controller.ts`, `tenants.service.ts`
- **Evidence:**

  `tenants.controller.ts:22-27`:
  ```ts
  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Post('signup')
  signup(@Body() dto: TenantSignupDto) { return this.tenantsService.signup(dto); }
  ```

  `tenants.service.ts:123-172` — no payment, no email verification, no invite; it goes straight to
  provisioning inside a transaction:
  ```ts
  async signup(dto: TenantSignupDto) {
    const normalizedSlug = assertValidTenantSlug(dto.slug);
    ...
    return this.prisma.$transaction(async (tx) => {
      let defaultPlan = await this.plansRepository.findByKey(DEFAULT_PLAN_KEY, tx);
      ...
      const tenant = await this.tenantsRepository.create({ ...
  ```

  Contrast the paid path, which requires a live order, an owner-email OTP and Stripe
  (`public-billing.controller.ts:153-306`). This route requires none of it.

- **Current behaviour:** 20 fully-provisioned tenants per IP per 10 minutes = 2 880 per day per
  source address, each with its own admin user, plan record, settings rows and seed data, on a
  shared Neon database with no per-tenant storage accounting. It is also a slug-reservation
  weapon: `tenants.service.ts:130-132` returns `409 'Tenant slug is already in use.'`, so a squatter
  can take every desirable slug.
- **Risk:** Database bloat, slug squatting, and a supply of authenticated sessions that RATE-03
  then leaves entirely unthrottled — an attacker signs up for free and attacks the API from
  inside.
- **Remediation:** Decide whether this route should exist at all now that
  `POST /api/public/billing/onboarding` is the funnel — if it is legacy, delete it. If it must
  stay, require owner-email verification before the tenant row is created (reuse
  `OwnerEmailVerificationService`), and lower its budget to **3 per hour per IP** via a route
  override in `public-rate-limit.guard.ts:42-44` — three, because a legitimate human creates one
  workspace and occasionally retries.
- **Difficulty:** LOW (budget) / MEDIUM (verification gate)
- **Regression risk:** LOW
- **Fix now:** YES *(the budget override; the gate is a product decision)*

---

### RATE-14 — Payroll calculation is re-entrant, unqueued and uncapped

- **Category:** Resource exhaustion / concurrency
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/payroll/payroll-run.service.ts`
- **Evidence:**

  `payroll-run.controller.ts:169-177` — a plain synchronous POST, no queue:
  ```ts
  @Post('runs/:id/calculate')
  calculatePayrollRun(@CurrentUser() user, @Param('id', new ParseUUIDPipe()) id) {
    return this.payrollRunService.calculateDraftPayrollRun(user, id);
  }
  ```

  `payroll-run.service.ts:951-988` — the only status guard excludes three terminal states, and
  `CALCULATING` is **not** among them:
  ```ts
  if (run.status === PayrollRunStatus.APPROVED || run.status === PayrollRunStatus.PAID || run.status === PayrollRunStatus.LOCKED) {
    throw new BadRequestException('Approved, paid, or locked payroll runs cannot be recalculated.');
  }
  ...
  const employees = await this.prisma.employee.findMany({ where: buildPayrollEmployeeEligibilityWhere({...}) });
  await this.prisma.payrollRun.update({ where: { id }, data: { status: PayrollRunStatus.CALCULATING, ... } });
  await this.clearRunDraftData(user.tenantId, id, user.userId);
  ```
  So a second call arriving while the first is mid-flight passes the guard, sets `CALCULATING`
  again, and calls `clearRunDraftData` on rows the first invocation is still writing.

  An advisory lock exists elsewhere in the module and demonstrates the pattern that is missing
  here — `payroll.service.ts:444`:
  ```ts
  Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${currentUser.tenantId}:${payrollCalendarId}`}))`
  ```

  There is no rate limit on the endpoint (RATE-03) and no job queue for it (contrast
  `data-management.controller.ts:148-161`, where exports *are* queued).

- **Current behaviour:** One payroll administrator clicking Calculate fifty times — or a script —
  starts fifty concurrent full-tenant payroll computations on the single API process, each
  iterating every eligible employee and resolving compensation, benefits, settings and tax per
  employee. They also race on the same draft rows.
- **Risk:** Availability for every tenant on the shared instance, plus a data-integrity race on
  draft payroll lines that could produce a partially-cleared run. The permission needed
  (`payroll-runs.calculate`) is held by ordinary payroll staff.
- **Remediation:** Two changes:
  1. Refuse re-entry: add `PayrollRunStatus.CALCULATING` to the excluded set at
     `payroll-run.service.ts:953-961`, and take `pg_advisory_xact_lock(hashtext(tenantId:runId))`
     at the top of `calculateDraftPayrollRun` in the same shape as `payroll.service.ts:444`.
  2. Cap concurrency: **2 concurrent expensive operations per tenant, 10 per minute per tenant**,
     enforced by the `@Expensive()` decorator proposed in RATE-03. Two, because a tenant realistically
     runs one payroll at a time and a second is a legitimate retry; anything beyond is a mistake or
     an attack. Apply the same decorator to `POST /api/data-management/imports/:jobId/execute`
     and `POST /api/data-management/exports`.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM — the advisory lock changes failure behaviour under contention; needs
  a spec asserting the second caller gets a clean `409`, not a hang.
- **Fix now:** YES

---

### RATE-15 — DLP screenshot ingest: 25 MB bodies, no per-device throttle, onto the shared 5 GB disk

- **Category:** Resource exhaustion
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/agent/dlp/`, `services/api/src/main.ts`
- **Evidence:**

  `main.ts:141-144` — the largest body limit in the product, by an order of magnitude:
  ```ts
  expressApp.use(dlpScreenshotPath, json({ type: 'application/json', limit: '25mb' }));
  ```
  where `dlpScreenshotPath = '/api/agent/dlp/screenshot-events'` (`main.ts:129`).

  `agent/dto/dlp-capture.dto.ts:36,145` — `MAX_SCREENSHOT_BASE64_LENGTH = 8_000_000` with
  `@ArrayMaxSize(3)` — so ~24 MB per request is the intended maximum, matching the parser limit.

  `dlp.controller.ts:53,69` — `@UseGuards(JwtAuthGuard, PermissionsGuard)`. Authenticated, and
  therefore (RATE-03) subject to **no** request-rate limit at all.

  `dlp.service.ts:184` — bytes land on the Render disk:
  ```ts
  const stored = await this.storage.saveFile({ ... });
  ```
  `storage.service.ts:25-40` — `saveFile` performs no size or quota check of its own; the 10 MB
  `getMaxUploadBytes()` at `:12-16` is only consulted by callers that choose to, and this caller
  does not.

  `render.yaml:52-55` — one 5 GB disk, shared:
  ```yaml
  disk:
    name: dijipeople-storage
    mountPath: /var/data
    sizeGB: 5
  ```
  and `:41-46` records what else lives on it: *"tenant documents, branding assets, and published
  app-release installers."*

  Retention is opportunistic and hourly per tenant — `dlp.service.ts:56,237-239`:
  `RETENTION_THROTTLE_MS = 60 * 60 * 1000`.

- **Current behaviour:** A compromised, malicious or simply buggy agent device holding a valid
  session (90-day refresh token) can post 24 MB every request with nothing counting. 210 requests
  fills the disk.
- **Risk:** Filling `/var/data` breaks document upload, branding assets and agent-installer
  publication for **every tenant**, not just the offending one, and it is a single shared disk
  with no per-tenant accounting.
- **Remediation:** Add a per-device ingest budget to the DLP controller: **30 screenshot batches
  per minute per `deviceId`**, which is one every two seconds — well above the agent's own capture
  cadence (`update-agent-settings.dto.ts:26` caps the configurable interval at 3 600 s) and far
  below a flood. Add a per-tenant storage accounting check in `DlpService` before `saveFile`,
  refusing ingest above a per-tenant byte budget derived from the retention settings already
  present (`dlp.service.ts:40-41`, `screenshotRetentionDays`). Longer term, move DLP bytes off the
  Render disk to object storage — `render.yaml:48-51` already records that the disk is what pins
  the API to one instance.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** LATER

---

### RATE-16 — The OTP attempt counter resets on every resend

- **Category:** Brute force
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/billing/services/owner-email-verification.service.ts`
- **Evidence:**

  `:262-264` — six digits, 10⁶ space:
  ```ts
  function generateCode() { return String(randomInt(0, 1_000_000)).padStart(6, '0'); }
  ```
  `:11,14` — `MAX_ATTEMPTS = 5`, `RESEND_INTERVAL_MS = 60_000`.
  `:110-119` — a resend zeroes the budget:
  ```ts
  emailVerificationAttempts: 0,
  ```

- **Current behaviour:** 5 guesses, resend (60 s), 5 more, indefinitely — a sustained 5 guesses per
  minute against one order, 7 200/day. Against a 10⁶ space that is a ~70-day expected time to a
  hit; the order's own expiry is the real bound. The `PublicRateLimitGuard` budget of 20 writes
  does not bind because it is keyed per `onboardingId` (RATE-08) and 20 > 5.
- **Risk:** Low in practice — an attacker must already hold a valid `onboardingId` (a v4 UUID,
  `public-billing.controller.ts:213-215` `ParseUUIDPipe({ version: '4' })`) and the order expires.
  Reported because the reset is a silent weakening of a control the surrounding code reasons
  carefully about.
- **Remediation:** Track a *cumulative* attempt count on the order alongside the per-code one and
  hard-fail the order after **20 total wrong guesses** regardless of resends — four codes' worth,
  which is more retries than a person legitimately needs and 1/50 000 of the code space.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### RATE-17 — No abuse escalation of any kind: no CAPTCHA, no progressive delay, no reputation, no alerting

- **Category:** Abuse prevention
- **Severity:** MEDIUM
- **Confidence:** NOT OBSERVED *(searched specifically)*
- **Known:** NEW *(ITEM-0069 proposes CAPTCHA as an option; nothing was built)*
- **Component:** whole platform
- **Evidence:**

  - **CAPTCHA / Turnstile / reCAPTCHA / hCaptcha:** `grep -rli "captcha\|turnstile\|recaptcha\|hcaptcha"`
    across `apps`, `services`, `packages`, `render.yaml` returns **no implementation** — only
    honeypot comments and the ITEM-0069 proposal.
  - **Honeypot:** present on two forms only — `apps/landing/app/subscribe/subscribe-form.tsx:897`
    and `/request-demo`. `docs/knowledge/product/landing-website.md:73` records the gap:
    *"`/contact` carries neither."*
  - **Progressive delay / exponential backoff:** absent. `PublicRateLimitGuard` is binary — 20 free,
    then hard `429` (`public-rate-limit.guard.ts:61-69`). No `Retry-After` header is set.
  - **IP reputation / allow-deny lists:** absent. No source in the repo consults any reputation
    service, and no denylist exists.
  - **Volume alerting:** absent. `modules/platform-monitoring/platform-monitoring.service.ts` is a
    read-and-browse surface over `ErrorLog` — it has sorting, filtering and severity buckets
    (`:593-621`) but no thresholds, no rules and no outbound notification.
    `grep -n "429\|RATE_LIMIT_EXCEEDED\|auth.login.failed" services/api/src/modules/platform-monitoring/`
    → zero matches. Nothing anywhere reacts to a spike in `429`s, `401`s or lock events.
  - **Lock notification:** `login-lockout.service.ts:104-113` logs a warning and stops. The victim
    is never told (see RATE-12).

- **Risk:** Every control in this report is a static threshold with no escalation and no
  observation. An attack that stays under the thresholds is invisible; an attack that exceeds them
  is also invisible, because nothing watches the rejection rate.
- **Remediation, in the order that buys the most per unit of work:**
  1. **Alerting first, because it costs nothing and reveals whether the rest is needed.** Add a
     rule to `PlatformMonitoringService`: emit a `PlatformEventsService` event when
     `errorCode = 'RATE_LIMIT_EXCEEDED'` exceeds **50 occurrences in 5 minutes**, or
     `AUTH_UNAUTHORIZED` on `@Public()` paths exceeds **200 in 5 minutes**, or more than
     **10 accounts lock in 15 minutes**. Those numbers are chosen to be an order of magnitude above
     ordinary noise for a platform of this size and to fire before an attack completes.
  2. **`Retry-After` on the `429`** (`public-rate-limit.guard.ts:62-68`), computed from
     `current.resetsAt`. Costs one line and makes legitimate clients back off instead of retrying
     into the wall.
  3. **A honeypot on `/contact`**, matching the two forms that already have one.
  4. **Cloudflare Turnstile on the four unauthenticated write surfaces that create durable
     records** — `/public/leads`, `/public/partners/inquiries`, `/public/billing/onboarding`,
     `/tenants/signup` — verified server-side in the corresponding controller. Turnstile because
     the platform is already behind Cloudflare (§0), so it adds no new vendor. Only after (1)
     shows the volume justifies it.
- **Difficulty:** LOW (1–3) / MEDIUM (4)
- **Regression risk:** LOW
- **Fix now:** YES for (1) and (2); LATER for (4)

---

### RATE-18 — No per-tenant usage quotas exist anywhere

- **Category:** Quotas
- **Severity:** LOW
- **Confidence:** NOT OBSERVED *(searched specifically)*
- **Known:** NEW
- **Component:** `services/api/src/common/guards/entitlement.guard.ts`, `modules/billing`
- **Evidence:**

  `entitlement.guard.ts:14-19` — the third gate is boolean feature entitlement, not metered usage:
  > *"Permission asks whether a person may do something; entitlement asks whether the tenant
  > purchased the thing at all."*

  `grep -rn "maxEmployees\|maxUsers\|seatCount\|seatLimit\|usageLimit\|quota" services/api/src/common/guards/entitlement.guard.ts services/api/src/modules/billing` → zero matches.
  `grep -n "maxEmployees\|maxUsers\|seatCount\|limitValue" services/api/prisma/schema.prisma` → zero matches across 325 models.

- **Current behaviour:** A tenant on the cheapest plan may create unlimited employees, upload
  unlimited documents, run unlimited payroll calculations and issue unlimited API calls. Plans
  differ only in which features are switched on.
- **Risk:** Primarily commercial, not security — but it is also the reason RATE-13, RATE-14 and
  RATE-15 have no natural ceiling: there is no per-tenant budget for any resource, so nothing
  bounds the damage a single tenant can do.
- **Remediation:** Out of scope for a rate-limiting fix, but it is the missing dimension. When
  seat limits arrive, the natural place is a fourth guard beside `EntitlementGuard`, keyed on
  `(tenantId, metric)`, checked on create paths. Record the decision as an ADR first — this is a
  product question.
- **Difficulty:** HIGH
- **Regression risk:** HIGH
- **Fix now:** NO

---

### RATE-19 — Gateway attendance ingest caps events per request but not requests

- **Category:** Resource exhaustion
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/attendance-integrations/gateways/gateway-service.controller.ts`
- **Evidence:**

  `:100` — `const MAX_EVENTS_PER_REQUEST = 5000;`
  `:229-244`:
  ```ts
  @Post('attendance/events')
  @UseGuards(GatewayAuthGuard)
  ...
  if (dto.events.length > MAX_EVENTS_PER_REQUEST) {
    throw ...(`A single request may carry at most ${MAX_EVENTS_PER_REQUEST} events.`);
  ```
  `GatewayAuthGuard` authenticates the credential; there is no throttle, and (RATE-03) no global
  one either. Same for `@Post('heartbeat')` at `:171-174`.

- **Current behaviour:** A paired gateway can post 5 000 attendance events as fast as it can open
  connections, each one entering `RawAttendanceIngestionService`. The per-request cap bounds one
  request, not the rate.
- **Risk:** Low — the caller must hold a valid gateway credential, so it is a misbehaving or
  compromised on-premise device rather than an anonymous attacker. Still an unbounded write path
  into the shared database from outside the datacentre.
- **Remediation:** Add a per-credential budget on `GatewayServiceController`, keyed on the
  authenticated `credentialId` rather than IP (an on-premise gateway sits behind a NAT that may be
  shared): **60 ingest requests and 12 heartbeats per minute per gateway**. Sixty because the
  gateway's own poll cycle is measured in seconds and 5 000 × 60 = 300 000 events/minute is already
  three orders of magnitude above any real device fleet.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### RATE-20 — One uncapped pagination parameter

- **Category:** Resource exhaustion
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/agent/dto/dlp-capture.dto.ts`
- **Evidence:**

  A scan of all `*.dto.ts` under `services/api/src` for `pageSize|limit|perPage|take` declarations
  found **26 capped with `@Max(…)` and one uncapped**:

  `dlp-capture.dto.ts:193-197`:
  ```ts
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
  ```
  No `@Max`. Compare `dlp.service.ts:32-33`, which defines `DEFAULT_ALERT_LIMIT = 100` and
  `MAX_ALERT_LIMIT = 500` for the sibling alerts query — the cap exists in the module and was not
  applied to this DTO.

- **Risk:** Low, and possibly clamped downstream in the service (I did not trace every consumer).
  Reported because it is the single outlier in an otherwise disciplined set.
- **Remediation:** Add `@Max(MAX_ALERT_LIMIT)` to `dlp-capture.dto.ts:197`, mirroring the constant
  already defined at `dlp.service.ts:33`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

## Answers to the specific questions asked

**Q4 — Brute force and credential stuffing: how many login attempts per minute can one IP make
against many accounts?**

**2 per minute per endpoint** (20 per 10-minute window), and the key does **not** include the
target account — so those 20 can be 20 different accounts, each with one password guess. Per IP
per day: 2 880 attempts, and they may be spread across three independent endpoints
(`/api/auth/login`, `/api/admin/auth/login`, `/api/agent/auth/login`) for **8 640 attempts/day/IP**.

**Can an attacker rotate emails to avoid per-account lockout?** Yes, completely. Per-account
lockout (5 → 30 min) never engages if each account is tried once. This is the correct design
choice — `login-lockout.service.ts:13-15` explains why the counter must be on the account — but
it means the *only* thing standing between a credential-stuffing list and the platform is the
per-IP budget, which is (a) forgeable if RATE-01 holds and (b) trivially defeated by a proxy pool.

**Is there any per-IP global cap?** **No.** The key is `(IP, path)`, so each endpoint has its own
budget, and any endpoint with an id in the path has one budget *per id* (RATE-08). Nothing anywhere
counts total requests from one source.

**Q5 — Enumeration: how fast could an attacker enumerate?**

| Oracle | Throttle | Rate |
|---|---|---|
| Tenant slug / code / domain — `GET /api/public/tenants/resolve` | **none** | line rate; 4.3 M/day at 50 req/s (RATE-09) |
| Tenant hostname — `GET /api/workspaces/resolve` | **none** | line rate |
| Tenant branding by slug — 2 routes | **none** | line rate |
| Invite token — `GET /api/auth/invitation-status` | **none** | line rate, but the token is `randomBytes(32)` (`user-invitations.service.ts:59`) so brute force is infeasible; the value is unlimited DB load and PII disclosure (`getInvitationStatus` returns `email`, `userId`, tenant name — `user-invitations.service.ts:187-207`) |
| User existence — `POST /api/auth/discover-workspaces` | 20/10min + `discoveryFailedAttempts` (ITEM-0069) | requires a password, so it is not an existence oracle |
| Employee code | no public endpoint found | N/A |
| Signature / partner token | 120 GET per 10 min **per token** | infeasible (256–320-bit tokens) |
| Onboarding slug availability | bound to a live order | as designed — but bypassed entirely by row 1 |

**Q6 — Resource exhaustion, body limits:**
- JSON: **1 MB** default (`main.ts:130`), **2 MB** Stripe raw (`:135`), **10 MB** platform email
  templates (`:139`), **25 MB** DLP screenshots (`:143`).
- urlencoded: **1 MB** (`main.ts:131`).
- **Multipart: no limit on 10 of 14 upload endpoints** (RATE-06) — express body limits do not apply.
- Pagination: 26 of 27 DTOs capped (RATE-20).
- Exports: queued (`data-management.controller.ts:148`), so bounded by the worker, not the request.
- Expensive endpoints with no concurrency cap or queue: **payroll calculate** (RATE-14),
  **import execute**, **report generation**. Demo-data reseed is `SUPER_ADMIN`-gated
  (`demo-data.controller.ts:10-12`) and not a concern.
- **Fifty concurrent payroll runs is not prevented by anything.** Confirmed at
  `payroll-run.service.ts:951-961`.

---

## Healthy — verified good

- **The forwarded-address invariant is real and mechanical.**
  `apps/web/lib/forwarded-headers.invariant.spec.ts` walks every `route.ts` under `app/api`,
  selects the ones that call `getApiBaseUrl` + `fetch(`, and fails if any omits
  `forwardedClientHeaders`. All 10 landing handlers comply
  (`grep -rln buildForwardedClientHeaders apps/landing/app/api` → all direct callers). The spec's
  own header comment records that the file it replaced *did not exist* while three apps' comments
  claimed it did — an unusually honest correction.
- **The public-write rate-limit invariant is mechanical, with a reasoned allowlist.**
  `services/api/src/common/guards/public-write-rate-limit.invariant.spec.ts:34-46` — two entries,
  each with a stated justification (Stripe signature verification; bearer release token), and
  `:73-80` records that an earlier version of the check was satisfied by the *import line* alone
  and therefore passed for every controller. Fixed and explained.
- **The guard's runtime behaviour is proven, not just its declaration.**
  `services/api/test/public-rate-limit.e2e-spec.ts` boots the real AppModule, exercises the 21st
  write, asserts `429 PUBLIC_RATE_LIMITED`, **and** asserts the untrusted-proxy case where
  `X-Forwarded-For` must be ignored (`:33-46`).
- **The refresh budget is correctly separated from the credential budget**, with the regression
  asserted in both directions — `public-rate-limit.guard.spec.ts:70-111` proves refresh gets 600
  *and* that seven named credential routes stayed at 20. BUG-2458.
- **Pagination is disciplined**: 26 of 27 `pageSize`/`limit` DTOs carry `@Max`, mostly `@Max(100)`
  (`attendance-query.dto.ts:131`, `audit-log-query.dto.ts:57`, `contracts.dto.ts:40`, …).
- **Auth emails have a real per-recipient cooldown.**
  `notifications/email/email-execution.service.ts:105-109,599-623` — 60 s per
  `(tenantId, eventCode, recipient)` for `AUTH_ACCOUNT_ACTIVATION`, `AUTH_PASSWORD_RESET` and
  `AUTH_OTP`, so `/auth/forgot-password` cannot be used to mail-bomb an address even at 20
  requests per window.
- **The onboarding OTP is well built** apart from RATE-16: sha256-hashed at rest
  (`owner-email-verification.service.ts:266-268`), `timingSafeEqual` comparison (`:270-274`),
  15-minute TTL (`:8`), 5 attempts per code (`:11`), 60-second resend interval throttled
  **per order rather than per IP** with the reasoning stated (`:89-99`).
- **Gateway pairing is correctly protected** — `PublicRateLimitGuard` **plus** a per-code attempt
  cap (`gateway-credential.service.ts:195,292`), and the pairing controller's comment states the
  reasoning (`gateway-service.controller.ts:119-123`).
- **The Stripe webhook does no work before verifying the signature**
  (`stripe-webhook.controller.ts:55-93`) and has a 2 MB raw cap (`main.ts:157-160`). Leaving it
  unthrottled is the right call and is documented in the invariant allowlist.
- **Public tokens have adequate entropy** — invitations `randomBytes(32)`
  (`user-invitations.service.ts:59`), signatures `randomBytes(32|40)`
  (`contracts.service.ts:3233,3525`), partner tokens `randomBytes(32|48)`
  (`partner-experience.service.ts:465,746,1192`). No rate limit is needed to make these
  unguessable.
- **Agent login's enumeration defences are thorough** — uniform message, timing equalisation
  against a dummy hash, and deterministic candidate resolution, all with the reasoning written
  down (`agent.service.ts:152-198`). BUG-0033's enumeration half is genuinely closed.
- **Body parsing is per-route and deliberately bounded**, with the DLP exception explained and
  tied to the DTO's own caps (`main.ts:125-144`).
- **Slug availability during onboarding is bound to a live session** with the oracle risk stated
  explicitly (`public-billing.controller.ts:200-208`) — the right instinct, undone elsewhere
  (RATE-09).

---

## Not examined / limits

- **I executed no request-volume probe against production.** The audit brief forbids database
  writes, and RATE-04 establishes that every rejected request writes a row. This is the single
  reason RATE-01 is LIKELY rather than CONFIRMED: I could not observe whether Cloudflare/Render
  preserve a client-supplied `X-Forwarded-For` prefix. One `curl` to `/api/health` (a read served
  by a pre-Nest Express handler, `main.ts:87-89`, which writes nothing) established the edge is
  Cloudflare→Render; nothing beyond that.
- **Cloudflare dashboard configuration is invisible to this audit.** There may be WAF rules,
  bot-fight mode or edge rate limits configured outside the repository. Nothing in
  `render.yaml`, `.github/`, or any tracked file declares any. Given the project's own recorded
  experience that `render.yaml` is not synced to the live service
  (`docs/bugs/BUG-0767…`, quoted at `render.yaml:6-20`), the same caveat applies in reverse:
  the deployed `TRUST_PROXY_HEADERS` may differ from the file.
- **Render's live instance count was read from `render.yaml:5,48-51`, not from the Render API.**
  The file states `plan: starter` and that the attached disk pins the service to one instance;
  I did not query Render to confirm the running configuration.
- **I did not trace all 418 `apps/web` and 83 `apps/admin` route handlers individually** for
  self-imposed limits. I confirmed there is no Next.js middleware in any app and that the
  forwarded-header invariant covers the direct-to-API subset; a per-handler throttle in one of the
  501 proxies would be an outlier I may have missed.
- **The `gateway/` .NET solution's own client-side throttling was not reviewed** — only the API
  side of the contract.
- **DLP `limit` (RATE-20) was not traced to its consumer**, so it may be clamped in the service.
- **Load testing was not performed.** The 1.13 s bcrypt figure (RATE-05) is a real measurement on
  this machine, not on a Render `starter` container, where it will be slower. The saturation
  arithmetic that follows from it is therefore conservative.
