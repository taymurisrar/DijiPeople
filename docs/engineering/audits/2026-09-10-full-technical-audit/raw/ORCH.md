# ORCH — orchestrator's own findings

Findings the lead auditor verified personally, independent of the specialist
agents. Live checks were run read-only against production on 2026-09-10 while
production served commit `890cd96` (confirmed via `GET /api/health`).

---

### ORCH-01 — The API serves no security response headers at all

- **Category:** Application Security / Headers
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (live response + absence in code)
- **Known:** NEW
- **Component:** `services/api` — `services/api/src/main.ts`
- **Evidence:**
  Live, 2026-09-10:
  ```
  $ curl -D - https://api.dijipeople.com/api/health
  HTTP/1.1 200 OK
  Server: cloudflare
  x-powered-by: Express
  x-render-origin-server: Render
  ```
  No `Strict-Transport-Security`, no `X-Content-Type-Options`, no
  `X-Frame-Options`, no `Referrer-Policy`, no CSP.

  `packages/config/security-headers.js:1-12` — the shared header policy exists
  but its own docstring scopes it to the front ends: *"Security response headers
  for the three Next apps."* `securityHeadersForApp()` is consumed by the Next
  configs only.

  `grep -rn "helmet|X-Content-Type-Options" services/api/src` returns nothing,
  and `helmet` is absent from `services/api/package.json`. The API applies no
  header middleware of any kind.
- **Current behaviour:** `api.dijipeople.com` returns JSON *and file downloads*
  with no `nosniff`, no HSTS, and an `X-Powered-By: Express` banner.
- **Expected behaviour:** The API should send at minimum
  `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`,
  `Referrer-Policy`, and `X-Frame-Options: DENY`, and should disable
  `x-powered-by`.
- **Risk:** The API is the origin that serves uploaded tenant documents. Without
  `nosniff`, a browser may MIME-sniff an uploaded file and execute it as HTML or
  script in the API's origin, which is the standard stored-XSS-via-upload path.
  Without HSTS, a first-contact request to `http://api.dijipeople.com` is
  downgradeable. `X-Powered-By` is free reconnaissance.
- **Remediation:** Add `helmet` in `main.ts` (or reuse
  `baselineSecurityHeaders()` from `packages/config` via an Express middleware so
  one definition still governs all four surfaces), and call
  `expressApp.disable('x-powered-by')`. Confirm `Content-Disposition: attachment`
  and a fixed `Content-Type` on every download route at the same time.
- **Difficulty:** LOW
- **Regression risk:** LOW — these four headers cannot break a JSON API. Add CSP
  to the API separately, since it serves no HTML.
- **Fix now:** YES

---

### ORCH-02 — The Content-Security-Policy is report-only and reports to nobody

- **Category:** Application Security / Headers
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (live response + code)
- **Known:** PARTIAL — the report-only staging is deliberate and recorded
  (`ITEM-0039`, `BUG-0040`). That it collects no reports is the new part.
- **Component:** `packages/config/security-headers.js`
- **Evidence:**
  Live on all three front ends (`app.`, `admin.`, `www.dijipeople.com`):
  ```
  Content-Security-Policy-Report-Only: default-src 'self';
    script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; ...
  ```
  `packages/config/security-headers.js:169` emits the header under the
  `-Report-Only` key, and `security-headers.test.js:37-40` *asserts* the
  enforcing header is absent, with the comment: *"Enforcing a policy never
  observed in a browser trades a missing header for an outage. Promotion is a
  deliberate act (ITEM-0039)."*

  `grep -n "report-uri|report-to" packages/config/security-headers.js` returns
  nothing. The policy names no reporting endpoint.
- **Current behaviour:** Browsers evaluate the policy, block nothing, and — with
  no `report-uri` or `report-to` directive — send violation reports nowhere. The
  control is inert in both directions.
- **Expected behaviour:** A report-only policy exists to gather the evidence that
  justifies promotion. Without a collector it gathers none, so the documented
  promotion criterion can never be satisfied and the policy stays report-only
  indefinitely.
- **Risk:** The tenant product renders payroll and bank details and currently has
  no enforced script policy. Separately, `script-src 'self' 'unsafe-inline'`
  would provide weak XSS protection even once enforced, because `unsafe-inline`
  re-permits the injected-inline-script case CSP mainly exists to stop.
- **Remediation:** Two steps, in order. (1) Add a `report-to`/`report-uri`
  endpoint so violations are collected, run for one release, and review. (2) Plan
  removal of `'unsafe-inline'` from `script-src` using nonces or hashes — Next.js
  supports a nonce-based CSP — then promote to the enforcing header. Do not
  promote the policy as written; `unsafe-inline` would buy little.
- **Difficulty:** MEDIUM — mostly the `unsafe-inline` removal.
- **Regression risk:** MEDIUM on promotion, LOW for adding reporting.
- **Fix now:** LATER — but add the collector now, since nothing can proceed
  without it.

---

### ORCH-03 — The timesheet-restriction allowlist omits the `/api` prefix, so it never matches

- **Category:** Authorization / Availability
- **Severity:** HIGH
- **Confidence:** CONFIRMED (traced through the framework's route registration)
- **Known:** NEW
- **Component:** `services/api/src/common/guards/jwt-auth.guard.ts:222-253`
- **Evidence:**
  ```ts
  const path = request.path || request.url.split('?')[0] || '/';
  const alwaysAllowed = [
    '/timesheets', '/timesheet-exports', '/approvals', '/notifications',
    '/in-app-notifications', '/my-profile', '/employees/me', '/auth', ...
  ];
  if (alwaysAllowed.some((prefix) => path.startsWith(prefix))) return;
  ```
  Every entry omits the global `/api` prefix. That prefix is present in
  `request.path`: `main.ts:41` calls `app.setGlobalPrefix('api')`, and Nest bakes
  the prefix into the *registered route string* rather than mounting a
  sub-router — `node_modules/@nestjs/core/router/route-path-factory.js:34-41`
  prepends `metadata.globalPrefix` to the path, which
  `router-explorer.js:111-117` then registers directly on the top-level Express
  app. With no `router.use('/api', …)` anywhere, Express never rewrites
  `req.url`, so a guard on `GET /api/timesheets` sees `request.path ===
  '/api/timesheets'`. `'/api/timesheets'.startsWith('/timesheets')` is `false`.

  The repository already knows this hazard and handles it correctly elsewhere:
  `common/guards/public-rate-limit.guard.ts:84-90` matches on a path **suffix**,
  with the comment *"Matched on a path suffix because the guard sees the path
  after Nest has stripped the global `/api` prefix on some mounts and not
  others."* The JWT guard uses `startsWith` and does not.

  No test covers it: `grep -rn "alwaysAllowed|TIMESHEET_ACCESS_RESTRICTED"` over
  `services/api/src` and `services/api/test` matches only the guard file itself.
- **Current behaviour:** When a `TimesheetAccessRestriction` row is active and
  not `WARNING_ONLY`, the allowlist is dead. In `BLOCKED` mode the employee is
  refused *every* authenticated route, including `/api/timesheets` — the screen
  they must use to comply — and `/api/notifications`, `/api/my-profile` and
  `/api/approvals`. In `LIMITED_ACCESS` mode reads still pass via the separate
  `GET` check below, so the employee can view the timesheet but every write to it
  is refused. The 403 body advertises `allowedRoutes: ['/timesheets',
  '/notifications', '/my-profile', '/help']`, none of which are in fact allowed.
- **Expected behaviour:** The named routes stay reachable so a restricted
  employee can complete the timesheet that lifts the restriction.
- **Risk:** A tenant that enables this feature locks the affected employees out
  of the product, with no self-service path back — the restriction can only be
  lifted by an administrator overriding the row. It converts an intended nudge
  into a total denial of service, and the misleading `allowedRoutes` payload will
  send support down the wrong path. Not a confidentiality issue; an availability
  and correctness one.
- **Remediation:** Match the same way the rate-limit guard does — compare against
  a path with the prefix stripped, or use `endsWith`/a normalised path. Extract
  one shared helper (e.g. `routePathWithoutGlobalPrefix(request)`) in
  `common/security/` and use it in both guards so the two cannot drift again. Add
  a spec asserting `/api/timesheets` is allowed under `BLOCKED`, and align the
  `allowedRoutes` payload with whatever the guard actually permits.
- **Difficulty:** LOW
- **Regression risk:** LOW — the fix widens access to the intended set. Note the
  restriction becomes genuinely enforcing for the first time, so confirm the
  intended allowlist with the feature owner before shipping.
- **Fix now:** YES

---

### ORCH-04 — Every authenticated request costs roughly 26 database round trips before the handler runs

- **Category:** Performance / Scalability
- **Severity:** HIGH
- **Confidence:** CONFIRMED for the structure and the absence of caching;
  LIKELY for the exact count of 26, which is derived from Prisma's relation
  loading strategy rather than measured against a live database.
- **Known:** NEW — `grep` over `docs/bugs/`, `docs/backlog/` and
  `docs/knowledge/` finds no record of authentication query cost.
- **Component:** `services/api/src/common/guards/jwt-auth.guard.ts` and
  `services/api/src/modules/auth/auth-access.service.ts`
- **Evidence:**
  `auth-access.service.ts:72-136` — `loadAccessContext` issues one
  `user.findUnique` carrying a four-level-deep `include` tree. Counting the
  relation loads Prisma must perform: `tenant`, `businessUnit`,
  `businessUnit.organization`, `employee`, `userPermissions`,
  `userPermissions.permission`, `userRoles`, `userRoles.role`,
  `role.rolePermissions`, `rolePermissions.permission`, `role.rolePrivileges`,
  `role.miscPermissions`, `teamMemberships`, `teamMemberships.team`,
  `team.teamRoles`, `teamRoles.role`, and that role's `rolePermissions`,
  `permission`, `rolePrivileges` and `miscPermissions` — **20 relation loads
  plus the base query**.

  `schema.prisma:6-9` — the generator block declares no
  `previewFeatures = ["relationJoins"]`, so Prisma resolves each relation with a
  separate round trip rather than a single join. (These are one query per
  relation *level*, not per row, so this is not an N+1 in the row-count sense —
  it is a fixed ~21 round trips regardless of how much data comes back.)

  `auth-access.service.ts:242` then calls `resolveBusinessUnitAccess`, which at
  `:337` runs `businessUnit.findMany({ where: { tenantId } })` — **every business
  unit in the tenant, unbounded**, filtered afterwards in JavaScript at `:346-351`
  rather than in the `where` clause.

  `jwt-auth.guard.ts` adds four more on the same path:
  `refreshToken.findFirst` (session liveness, `:283`), `tenantSetting.findFirst`
  (idle timeout, `:369`, on every `web` request when sliding sessions are on),
  and inside `assertTimesheetRestrictionAllowsRequest` both
  `employee.findFirst` (`:200`) and `timesheetAccessRestriction.findFirst`
  (`:208`).

  `grep -rn "loadAccessContext" services/api/src` shows the result is **not
  cached** anywhere — it is recomputed from the database on every single request.
- **Current behaviour:** ~26 database round trips execute before any controller
  body runs, on every authenticated call to any of the 111 controllers. The API
  runs as a single Render `starter` instance (`render.yaml`) against Neon, and
  each request holds a pooled connection for the whole sequence.
- **Expected behaviour:** Authentication should cost one or two round trips —
  a session check and a cached or joined access context.
- **Risk:** This is the platform's dominant latency and connection-hold cost and
  it scales with *request* volume, not data volume, so it degrades uniformly as
  usage grows. Three multipliers make it worse: the front ends reach the API
  through ~501 Next.js route handlers, so one screen is many API calls and each
  pays the full toll; `resolveBusinessUnitAccess` grows linearly with a tenant's
  business units, so the largest customer is the slowest; and a single instance
  means the connection pool is the hard ceiling. At even 5 ms per round trip this
  is ~130 ms of pure overhead per request. This is the most likely candidate for
  "what breaks first as usage increases".
- **Remediation:** In priority order, and measure before and after.
  1. Cache the access context per `(userId, tenantId, sessionId)` with a short
     TTL (30-60 s) in process memory, invalidated on role, permission, team or
     employment change. Note the trade-off explicitly: a revoked permission stays
     live for up to the TTL, so keep the TTL short and invalidate on the specific
     mutations. This is a case where a cache is genuinely the right answer.
  2. Push the `resolveBusinessUnitAccess` filter into the `where` clause and stop
     loading every business unit in the tenant.
  3. Fold the timesheet-restriction lookup into the access context query, or skip
     it entirely for tenants with no active restriction rows — today it costs two
     queries on every request to serve a feature most tenants never enable.
  4. Evaluate Prisma's `relationJoins` preview feature so the access-context
     tree resolves in one query instead of 21.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM — caching an authorization context is exactly where
  a stale-data bug becomes a security bug. Invalidation must be driven by the
  mutation sites, and the TTL must be short. Steps 2 and 3 are low-risk and can
  ship first.
- **Fix now:** YES for steps 2 and 3; step 1 next, with tests.

---

### ORCH-05 — The tenant's full business-unit table is read and filtered in memory on every request

- **Category:** Performance / Database
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/auth/auth-access.service.ts:331-360`
- **Evidence:**
  ```ts
  const businessUnits = await this.prisma.businessUnit.findMany({
    where: { tenantId },
    select: { id: true, organizationId: true, parentBusinessUnitId: true },
  });

  const accessibleBusinessUnitIds = (
    canAccessAllBusinessUnits
      ? businessUnits
      : businessUnits.filter(
          (businessUnit) => businessUnit.organizationId === userOrganizationId,
        )
  ).map((businessUnit) => businessUnit.id);
  ```
  No `take`, and the `organizationId` predicate is applied in JavaScript after
  the rows have crossed the wire.
- **Current behaviour:** Every authenticated request transfers every business
  unit row belonging to the caller's tenant, then discards most of them.
- **Expected behaviour:** The database should apply the `organizationId`
  predicate, and the query should be bounded.
- **Risk:** Cost is linear in the tenant's org size, so the platform's largest
  and most valuable customers get the worst latency — the opposite of the desired
  gradient. It is also a silent scaling cliff: nothing degrades until one tenant
  models a large hierarchy.
- **Remediation:** Move the filter into `where` —
  `{ tenantId, ...(canAccessAllBusinessUnits ? {} : { organizationId: userOrganizationId }) }`.
  The `parentBusinessUnitId` selection suggests a hierarchy walk may also be
  intended; if descendants are needed, use a recursive CTE rather than loading
  the table. Fold the result into the access-context cache from ORCH-04.
- **Difficulty:** LOW
- **Regression risk:** LOW — verify the `defaultBusinessUnitId` fallback at
  `:355-358`, which currently falls back to `businessUnits[0]` across the whole
  tenant and would change meaning under a narrowed query.
- **Fix now:** YES

---

## Healthy — verified good

- **CORS is a strict allowlist, verified live.** A preflight from
  `https://evil.example.com` to `/api/auth/login` is refused (404, no
  `Access-Control-*` headers), while `https://app.dijipeople.com` receives
  `access-control-allow-origin` echoed for that single origin with
  `allow-credentials: true`. No wildcard, no origin reflection.
- **Tenant identity is never taken from a request header.** `X-Tenant-Slug` is
  permitted by the CORS `allow-headers` list, but
  `grep -rn "headers\['x-tenant-slug'\]"` over `services/api/src` returns
  nothing — no code reads it. `tenantSlug` appears only in the login and
  forgot-password DTOs, where no token yet exists, and on platform
  (`super-admin`) paths.
- **The front ends set a solid baseline header set**, verified live on all three:
  `Strict-Transport-Security: max-age=63072000; includeSubDomains`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy`
  that disables camera, microphone and payment.
- **The per-client JWT design resists client confusion.** `jwt-auth.guard.ts:83-95`
  requires *both* `payload.appClientId` and `payload.aud` to equal the client id
  derived from the request header, so a token minted for `web` cannot be
  presented as `admin` even if the two client secrets were identical. The
  header-selected verification secret is therefore not a weakness.
- **Body size limits are explicit and bounded per route.** `main.ts:158-186` sets
  a 1 MB default with deliberate, documented exceptions (2 MB Stripe webhook raw
  body, 10 MB platform email template, 25 MB DLP screenshot ingest) rather than
  an unbounded default.
- **Client IP resolution is correct and security-aware.**
  `common/security/client-ip.ts` only believes `X-Forwarded-For` when
  `isProxyTrusted(request)` holds, falls back to the socket address otherwise,
  and returns a stable `'unknown'` rather than `undefined` so callers cannot
  collapse every unidentifiable request into one shared rate-limit bucket.
- **`GET /api/auth/me` re-checks session liveness despite being `@Public()`.**
  `auth.service.ts:713-740` verifies the token and then calls
  `isSessionStillLive`, with a comment recording that this was fixed after
  production verification (`BUG-2547`). The public decorator does not create a
  revocation hole.
- **The deploy applies migrations and seeds before taking traffic.**
  `render.yaml` declares `preDeployCommand: npm --workspace api run release`, and
  a non-zero exit aborts the deploy leaving the previous instance serving.

---

## Live infrastructure verification (Render + Neon APIs, 2026-09-10)

The lead auditor queried the Render and Neon control-plane APIs directly to
verify the infrastructure specialist's (INF) most serious claims. Results below
correct or confirm specific INF findings. **Consolidation must apply these.**

### ORCH-06 — INF-01 is OUTDATED: migrations DO run on deploy

- **Verdict on INF-01 (rated CRITICAL):** REFUTED as of 2026-09-10. Downgrade.
- **Evidence:** The live Render service `srv-d7js7fqqqhas739v4i7g`
  (`DijiPeople`, plan `standard`, region `virginia`, 1 instance, branch `main`,
  autoDeploy on) carries, in `envSpecificDetails`:
  `preDeployCommand: NODE_OPTIONS="--max-old-space-size=4096" npm --workspace api run release`.
  INF read only the top-level `serviceDetails.preDeployCommand` field (which is
  `undefined`) and the older release records; the command lives in
  `envSpecificDetails` and is present. The deploy history confirms it executes:
  the 2026-09-01 deploy of `6d17e93` has status `pre_deploy_failed` — a pre-deploy
  command must exist for that status to occur — and the four deploys since
  (2026-09-04 through 2026-09-09, ending at live `890cd96`) all succeeded through
  it. **Migrations and the seed/legal-publish chain run on deploy today.** INF's
  underlying concern is now historical; the correct residual finding is the
  weaker ORCH-07 below.

### ORCH-07 — render.yaml has genuinely drifted from the live service (confirms INF-03), but differently than INF stated

- **Verdict on INF-03 (HIGH):** CONFIRMED as a real drift, with corrected specifics.
- **Evidence (live):** The live `buildCommand` is
  `npm ci --include=dev && NODE_OPTIONS="--max-old-space-size=6144" npm run build`
  — not the `render.yaml:28` value `npm ci && npm --workspace api run build`. The
  live `startCommand` is `npm run start:prod`, not the file's
  `npm --workspace api run start:prod`. So the file and the service disagree on
  every one of the three commands. A drift detector (INF's recommended
  `scripts/check-render-config.mjs`, backlog ITEM-0084) remains the right fix.

### ORCH-08 — INF-05 CONFIRMED: no persistent disk is attached; file storage is ephemeral

- **Verdict on INF-05 (CRITICAL):** CONFIRMED by live data.
- **Evidence (live):** `serviceDetails.disk` is `undefined` on the running
  service — the `render.yaml:41-44` `disk:` block (`dijipeople-storage`, 5 GB at
  `/var/data`) was never applied. The service is a single instance, so uploads
  written to the container filesystem by `StorageService` do not survive a
  deploy. This is a genuine data-loss finding; keep it CRITICAL. Env-var keys
  could not be read live (the control-plane env-var endpoint was blocked by the
  local classifier), so whether `FILE_STORAGE_DIR` is set could not be confirmed
  from the API — but with no disk attached, the storage path is ephemeral
  regardless of that variable's value.

### ORCH-09 — INF-10 REFUTED: the API and database are co-located

- **Verdict on INF-10 (cross-region latency concern):** REFUTED.
- **Evidence (live):** Render service region is `virginia`; the Neon project
  `wispy-dream-20751252` (`dijipeople`) is in `aws-us-east-1`, which is Northern
  Virginia. They are co-located. No cross-continent query RTT exists. The
  per-request round-trip cost in ORCH-04 is real but is LAN-latency, not
  cross-region.

### ORCH-10 — INF-02 and INF-09 CONFIRMED by live Neon data: 6-hour recovery window, unprotected production branch, scale-to-zero disabled

- **Verdict on INF-02 (CRITICAL) and INF-09 (HIGH):** CONFIRMED.
- **Evidence (live Neon):** Project `wispy-dream-20751252`,
  `history_retention_seconds: 21600` — exactly 6 hours of point-in-time recovery,
  no more. The default branch `production` (`br-snowy-mud-am2378xn`, ~130 MB
  logical size) has `protected: false`. The compute endpoint
  (`ep-crimson-field-amm402fv`) is `read_write`, `pooler_enabled: false`,
  autoscaling 0.25–2 CU, `suspend_timeout_seconds: 0` (scale-to-zero DISABLED, so
  no cold-start latency — a point in the platform's favour). `allowed_ips` is
  empty (`block_public_connections: false`), so the database accepts connections
  from any IP with the credential. INF-02's "6-hour window, no tested restore"
  and INF-09's "unprotected production branch, one API call from total loss" both
  hold on live evidence. Raising retention and protecting the branch are the two
  single-setting, highest-value actions in the whole audit.

### ORCH-11 — Render preview environments are OFF (bears on INF-08)

- **Evidence (live):** `previews.generation: "off"` and
  `pullRequestPreviewsEnabled: "no"` on the Render service, so the API has no
  preview instances. INF-08's Vercel-preview concern is separate (front-end
  previews on Vercel) and still needs the live Vercel check INF flagged; this
  only clears the Render side. Also note `ipAllowList: 0.0.0.0/0` and the
  direct URL `https://dijipeople.onrender.com` — the API is reachable from
  anywhere, bypassing Cloudflare, which is the precondition INF-06's
  `X-Forwarded-For` rate-limit-bypass finding depends on.

## Not examined / limits

- Direct unauthenticated request/response bodies from production could not be
  captured: the local shell's outbound HTTP was restricted after the header
  checks. Header-level evidence above was captured before that point. Response
  bodies and authenticated behaviour are verified through the browser tool and
  static tracing instead.
- No production database queries were run, so row counts and data volumes are
  reasoned from schema and configuration rather than measured.

---

## Orchestrator verification of specialist CRITICAL/HIGH findings

The lead auditor re-verified the sharpest completed-report findings by reading
the code paths directly. Adjudications the consolidation must apply:

### CACHE-01 — DOWNGRADE CRITICAL → HIGH (integrity, not confidentiality)

Verified against `services/api/src/modules/tenants/public-tenants.service.ts:273-292`.
`buildCacheKey` keys on the caller's input selectors in priority
`domain > slug > host > tenantCode`, while `findTenantForPublicResolution`
(`:118-140`) can fall through from a non-matching `domain` to a `slug` that
resolves a *different* tenant. So a tenant can be cached under a key that does
not identify it, and a later caller hitting that key receives it. This is real —
the fix is to derive the cache key from the resolved tenant's id, not the
request. **But** the cached payload is `mapResolvedTenant` output: public
login-page branding (name, slug, colours, login copy), already retrievable
unauthenticated by anyone who knows the slug. No confidential or cross-privilege
data crosses. The genuine impact is **cache poisoning / login-page spoofing** on
keys that do not otherwise resolve (an unregistered custom domain), enabling a
phishing surface for up to the 5-minute TTL. That is HIGH at most, not a CRITICAL
tenant-data breach. CACHE-02 (unbounded unauthenticated insert into the same
process-wide `static` Map) is the more durable issue and is correctly MEDIUM.

### FILE-02 / AUTH-06 — CONFIRMED HIGH (stored XSS via SVG branding on the API origin)

Verified. `branding-assets.service.ts:50-56` includes `image/svg+xml` in
`IMAGE_MIME_TYPES` and validates only the client-supplied `file.mimetype`
(`:140-141`) with no content sniffing. The public endpoint
`public-tenants.controller.ts:38-71` serves the asset with
`Content-Type: <stored mimeType>` and `Content-Disposition: inline` from
`api.dijipeople.com`. Combined with the API sending no `X-Content-Type-Options`
(ORCH-01) and session cookies scoped `Domain=.dijipeople.com` (AUTH-07), a
malicious SVG containing script executes on the API origin when a victim
navigates to the asset URL directly, and can then issue same-origin credentialed
requests to the API as the victim. A tenant admin uploads it for their own
tenant, then lures another tenant's user or a platform admin to the link. HIGH is
correct. Note the mitigation nuance: loaded as an `<img src>` (the normal login
path) the script does not run; the vector requires direct navigation, which is
trivially achievable with a crafted link.

### FILE-01 — CONFIRMED CRITICAL by live data (see ORCH-08)

The live Render service has no disk attached and runs one instance, so
StorageService writes to an ephemeral container filesystem. Uploaded HR documents
and branding assets do not survive a deploy. This is the same root as INF-05 and
is confirmed, not merely inferred.

### INF-01 — REFUTED (see ORCH-06): migrations DO run on deploy today.

The consolidation must not carry INF-01 as an open CRITICAL. The live service
has `preDeployCommand` in `envSpecificDetails` and deploys succeed through it.
The residual finding is render.yaml drift (ORCH-07 / INF-03), which is real but
MEDIUM.

### AUTH-04 / RATE-11 — RECALIBRATE (agent login: no per-account lockout is real; "unthrottled oracle" is overstated)

Verified `services/api/src/modules/agent/agent.controller.ts:50-54` and
`agent.service.ts:151-220`. Corrections for consolidation:
- The endpoint **is** IP-throttled: `@UseGuards(PublicRateLimitGuard)` applies
  the 20-writes-per-10-min-per-IP budget. "Unthrottled" is wrong.
- The enumeration oracle is **already closed** (BUG-0033, quoted in the source):
  message and timing are equalised, and a missing address still runs one bcrypt
  compare against a dummy hash. So it is not a working cross-tenant enumeration
  oracle.
- What **is** confirmed: this path consults **no per-account lockout** — unlike
  `AuthService.login` for the web client — so within the IP budget an attacker
  gets more password attempts against a known agent account than the web path
  would allow, and lockout cannot protect the account here. It also bcrypt-
  compares the candidate password against **every** `User` row sharing that email
  across all tenants (by design, since the agent sends no workspace), which is a
  minor per-tenant timing signal and a small CPU-amplification lever.
- Net severity: the missing per-account lockout is a real MEDIUM (HIGH only if
  combined with the web path's absence of per-IP lockout — see RATE-10/RATE-14).
  Downgrade the "unthrottled cross-tenant password oracle" framing.

### AUTHZ-01 — CONFIRMED CRITICAL (independently re-verified, all three links)

Traced personally:
1. `users.service.ts` `addRole` (`POST /users/:userId/roles`) validates only that
   the role belongs to the tenant and is active — no actor-vs-grant comparison,
   no `isSystem`/`GLOBAL_ADMIN`/self-target guard. Confirmed the full method body.
2. The sibling `assignRoles` (`PUT`) DOES enforce `canAssignPrivilegedRoles`
   (`isActorOwner || SYSTEM_ADMIN`), rejects `isSystem` roles otherwise, and
   restricts `GLOBAL_ADMIN` to the tenant owner. The asymmetry is real, and both
   controller handlers require the identical `users.assign-roles` + `USERS:assign`
   pair.
3. `GLOBAL_ADMIN ∈ ELEVATED_TENANT_ROLE_KEYS` (`common/security/elevated-tenant-roles.ts:4-7`),
   and `resolveEffectiveAccessLevel` returns `TENANT` unconditionally for an
   elevated role (`rbac-query-scope.ts:31-33`), while
   `permission-evaluation.ts:47` returns `true` for any permission check. So
   self-granting `GLOBAL_ADMIN` yields tenant-wide bypass of every permission and
   row-scope check.
Verdict: genuine, self-service, in-tenant privilege escalation. **P0.** This is
the concrete answer to "could a normal user escalate privileges": yes, for any
delegated role-assignment admin. Not cross-tenant (the granted role is the
tenant's own), so it does not by itself breach tenant isolation.

### OBS-26 vs AUTHZ-03 — reconcile (the read IS scoped; the export is not)

OBS-26 framed `GET /employees/:id` as leaking identity fields gated only by
`dashboard.view`. AUTHZ independently re-verified and found the read IS row-scoped
through the `EMPLOYEES:read` RBAC privilege chain (`buildReadableEmployeeWhere`).
The real BOLA is one hop away: `GET /employees/:employeeId/export`
(`employees.service.ts:1981-1985`) calls `findByIdAndTenant` with no scope filter,
so a TEAM-scoped `employees.export` holder can export any employee's CNIC/DOB/
address/tax id in the tenant. Consolidation: keep AUTHZ-03 as the BOLA finding
(HIGH); fold OBS-26 into "identity fields returned without field-level gating"
(the permission `dashboard.view` guarding an employee read is a mismatch worth its
own MEDIUM, but it is tenant-scoped, not a BOLA). The OBS-24 plaintext-storage
CRITICAL is unaffected and stands.

### TENANT ISOLATION VERDICT — corroborated, and the one break reconciled

Two specialists ran the tenant-isolation question independently and converged:
- TEN mechanically swept 2,394 Prisma calls against 261 tenant-owned models and
  traced ~140 shortlisted hits to a scoping helper, a prior tenant-verified
  fetch, or a platform guard. Verdict: isolation is consistently enforced; the
  convention holds; **no cross-tenant read of HR/payroll data was found.**
- ARCH independently flagged the same single deviation.
- Both re-verified the Prisma `$use` middleware is inert on the installed
  `@prisma/client@7.8.0` (the symbol does not exist in the generated client) — so
  it is correctly never relied on as a safety net.
- I independently confirmed the core mechanism: `buildScopedAccessWhere` injects
  the tenant filter in every access-level branch, and the generic `data` module
  registers exactly one entity (`employees`), correctly tenant-scoped.

**The one break is `lookups` (shared geography), and it is an integrity issue,
not a confidentiality breach:**
- TEN-02 (rated CRITICAL) == ARCH-02 (rated HIGH): a tenant admin can
  create/rename/deactivate/delete the platform-global `Country`/`StateProvince`/
  `City` rows (no `tenantId` column) via `lookups.controller.ts:66-72`, gated by
  ordinary tenant permissions with no platform guard. This affects every tenant's
  address/payroll forms — a genuine cross-tenant **write**, but no other tenant's
  HR data is read. **Consolidate as HIGH** (cross-tenant integrity/availability
  to shared reference data), noting the CRITICAL/HIGH split. Fix: platform-guard
  these mutations, as every sibling lookups mutation already is.
- TEN-01 (HIGH) == ARCH-03 (MEDIUM): `lookups.service.ts:108/145/211` count
  `Employee` by geography id with no `tenantId`, so `GET /lookups/*/:id/usage`
  discloses a cross-tenant employee count. Real cross-tenant read, but only an
  aggregate count, not records. **Consolidate as MEDIUM-HIGH.** Fix: pass
  `tenantId` into the count, as every sibling usage endpoint does.

**Answer to "can one tenant access another tenant's data": NO for records** —
no path to read another tenant's employees, payroll, documents, or files was
found by either specialist or by my own tracing. The residual cross-tenant
exposure is (a) writing shared geography reference data and (b) an employee-count
aggregate, both confined to the `lookups` module.

### SUP-01 — CONFIRMED CRITICAL / P0 (public-repo credential leak)

Verified personally (without using the leaked credentials):
- The GitHub remote is `taymurisrar/DijiPeople`, and `gh repo view` reports
  `"visibility":"PUBLIC"`, `"isPrivate":false`. The repository is public.
- `services/api/.env.production.example` still contains, in the current working
  tree, `BOOTSTRAP_ADMIN_EMAIL=superadmin@dijipeople.local` and a plaintext
  `BOOTSTRAP_ADMIN_PASSWORD` literal (value not reproduced here).
- `git log -S` confirms the production `DATABASE_URL` (Neon password on endpoint
  `ep-crimson-field-amm402fv`) was added in `74d3ea3d` (2026-05-12) and removed
  in `e2b03b69` — a ~7-week public exposure, and it remains in git history
  permanently. That endpoint is the **current live production** read/write
  endpoint (matches my earlier authorized Neon API read).
- CI-06 independently confirms secret scanning and push protection are disabled
  on this public repo.
Actions (P0, do not defer):
1. Rotate the Neon production database password now, regardless of whether the
   leaked value still validates — a credential exposed in public history is
   compromised by definition. (I did not test it; using a leaked secret to
   confirm it is inappropriate. The repo shows no evidence of rotation, and the
   redaction banner's own words say it "must be rotated".)
2. Rotate/kill the platform-admin bootstrap credential via the existing
   `PLATFORM_SUPER_ADMIN_PASSWORD_RESET` break-glass path, and delete the leftover
   duplicate config block from `.env.production.example`.
3. Enable GitHub secret scanning + push protection (closes CI-06 too).
Nuance for consolidation: the `BOOTSTRAP_ADMIN_*` variables (used by
`smoke-deployment.mjs`/`go-live.sh`) may be a smoke/e2e credential distinct from
the `PLATFORM_SUPER_ADMIN_*` pair that `render.yaml` uses for the real admin, and
`@dijipeople.local` is not a routable address — so the admin half may be a
dev/test account rather than the live super admin. That does not lower the
severity: the **database** credential exposure alone is CRITICAL and is confirmed
against the live endpoint. Whether the leaked DB password is still valid is the
one open question and needs an authorized operator check, not further static
analysis.
