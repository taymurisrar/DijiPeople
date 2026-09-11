# CACHE — Caching audit

**Auditor area:** Caching (Part A: what exists and whether it is safe; Part B: where caching would help)
**Commit audited:** `f55cf4b2` (worktree `D:/My Work/hrm-dijipeople/dijipeople-audit`, branch `agent/full-technical-audit`)
**Date:** 2026-09-10

---

## Summary of the cache inventory

There is **no external cache**. No Redis, no memcached, no `@nestjs/cache-manager`,
no Prisma cache extension, no CDN cache configuration. Everything is either an
in-process `Map` in the NestJS API, an HTTP header, or Next.js' own data cache on
the public landing site. The complete inventory is eleven items:

| # | Cache | Location | Key | Tenant-scoped? | User-scoped? | TTL | Invalidation |
|---|---|---|---|---|---|---|---|
| 1 | Public tenant resolve | `modules/tenants/public-tenant-cache.service.ts:11` (**`static`** Map, process-wide) | free-form string built at `public-tenants.service.ts:282-288` | **NO — see CACHE-01** | no | 300 s (`PUBLIC_TENANT_RESOLVE_CACHE_TTL_SECONDS`) | `deleteByPrefix('tenant:resolve:')` on a branding/profile write only |
| 2 | Tenant settings resolver | `modules/tenant-settings/tenant-settings-resolver.service.ts:489` | `tenantId` or `tenantId:organizationId` | yes | no | 30 s, hardcoded (`:1768`) | `invalidateTenantCache(tenantId)` on every settings write |
| 3 | Active organization | `modules/tenant-settings/active-organization.service.ts:17` | `` `${tenantId}:${userId}` `` | yes | yes | 60 s (`:22`) | `invalidateUser` from `users.service.ts:266` |
| 4 | Tenant entitlement snapshot | `common/security/tenant-entitlement.service.ts:82` | `tenantId` | yes | no | 60 s (`:38`) | `invalidate(tenantId)` from the control plane |
| 5 | Entitlement enforcement mode | `common/security/tenant-entitlement.service.ts:83-86` | none (one platform-wide value) | n/a (platform) | no | 60 s | `invalidateAll()` (test seam only) |
| 6 | Data-management module descriptors | `modules/data-management/module-registry.service.ts:205` | `moduleKey` | n/a (code constant) | no | **none — permanent** | never (correct: derived from compiled constants) |
| 7 | Generated runtime schema | `modules/data-management/module-registry.service.ts:35` | module-level `let` | n/a | no | permanent | never (correct: a JSON build artefact) |
| 8 | Customization default-solution sync | `modules/customization/customization.service.ts:66-70` | `tenantId` | yes | no | in-flight only | `delete` on settle (`:4307`) |
| 9 | Retention-run throttles | `modules/agent/agent.service.ts:142`, `modules/agent/dlp/dlp.service.ts:61` | `tenantId` | yes | no | interval-based | n/a (timestamps, not data) |
| 10 | Platform FX refresh guards | `modules/super-admin/platform-fx.service.ts:95-96` | currency pair | n/a (platform) | no | interval-based | n/a |
| 11 | Next.js data cache (landing only) | `apps/landing/lib/commercial-config.ts:125-126`, `apps/landing/lib/legal-server.ts:93,134` | Next hash of URL **+ request headers** | n/a (public marketing data) | no | 60 s / 300 s | time only |

Static registries (`approval-decision.registry.ts:59`, `connector.registry.ts:34`,
`outbox-dispatcher.service.ts:49`, `standard-report.registry.ts:519`,
`platform-lifecycle-notifications.catalog.ts:151`) are code-derived lookup tables,
not caches, and hold no tenant data.

**One cache is unsafe.** #1 is keyed on a value the caller chooses and populated
from a *different* value the same caller chooses. The rest are correctly
partitioned.

---

## Part A — findings

### CACHE-01 — `/public/tenants/resolve` caches a tenant under a key the caller picks independently of the tenant it resolved

- **Category:** Tenant Isolation / Cache poisoning
- **Severity:** CRITICAL
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/tenants/public-tenants.service.ts`, `public-tenant-cache.service.ts`, consumed by `modules/auth/auth.service.ts`

- **Evidence:**

  The cache key prefers `domain` → `slug` → `host` → `tenantCode`:

  `services/api/src/modules/tenants/public-tenants.service.ts:282-288`
  ```ts
  private buildCacheKey(input: ResolveInput) {
    if (input.domain) return `tenant:resolve:domain:${input.domain}`;
    if (input.slug) return `tenant:resolve:slug:${input.slug}`;
    if (input.host) return `tenant:resolve:host:${input.host}`;
  ```

  The **resolution** prefers `domain ?? host` → `slug` → `tenantCode` — a different
  order, and `host` outranks `slug` here while `slug` outranks `host` above:

  `services/api/src/modules/tenants/public-tenants.service.ts:119-131`
  ```ts
  const domain = input.domain ?? input.host;
  if (domain) {
    const tenantByDomain = await this.prisma.tenantDomain.findUnique({
      where: { domain },
      include: { tenant: { include: publicTenantInclude } },
    });
    if (tenantByDomain?.tenant) { return tenantByDomain.tenant; }
  ```

  The result is written under the mismatched key with no re-derivation:

  `services/api/src/modules/tenants/public-tenants.service.ts:108-109`
  ```ts
  const response = this.mapResolvedTenant(tenant);
  this.cache.set(cacheKey, response);
  ```

  The store is process-wide and shared by both DI instances:

  `services/api/src/modules/tenants/public-tenant-cache.service.ts:11`
  ```ts
  private static readonly sharedCache = new Map<string, CacheEntry<unknown>>();
  ```

  The endpoint is unauthenticated and carries **no rate-limit guard** (contrast
  `public-legal.controller.ts:33`, which does):

  `services/api/src/modules/tenants/public-tenants.controller.ts:18-31`
  ```ts
  @Public()
  @Get('resolve')
  resolve(@Query('slug') slug?, @Query('domain') domain?, @Query('host') host?, ...)
  ```

  Every provisioned tenant has a `TenantDomain` row for its workspace hostname, so
  the `host` an attacker supplies only has to be *some* tenant's hostname:

  `services/api/src/modules/tenant-domains/tenant-domain.service.ts:376-385`
  ```ts
  return db.tenantDomain.upsert({
    where: { domain: hostname },
    create: { tenantId: input.tenantId, domain: hostname, ... },
  ```

  **The login path reads the same cache**, and takes the tenant id from it:

  `services/api/src/modules/auth/auth.service.ts:1577-1590`
  ```ts
  const resolved = await this.publicTenantsService.resolve({
    slug: dto.tenantSlug, tenantCode: dto.tenantCode, domain: dto.domain, host: dto.host,
  });
  return { id: resolved.tenant.id, slug: resolved.tenant.slug, ... };
  ```

  `services/api/src/modules/auth/auth.service.ts:1295-1299`
  ```ts
  const tenantContext = await this.resolveLoginTenant(dto);
  const user = await this.usersService.findByTenantIdAndEmail(
    tenantContext.id, normalizedEmail,
  );
  ```

  And a miss writes the victim's email, IP and user-agent into the **attacker's**
  tenant audit log:

  `services/api/src/modules/auth/auth.service.ts:1311-1317`
  ```ts
  await this.logTenantAuthEvent({
    tenantId: tenantContext.id,
    entityId: normalizedEmail,
    email: normalizedEmail,
    failureReason: 'USER_NOT_FOUND',
  ```

  `services/api/src/modules/auth/auth.service.ts:1756-1763` puts `email`,
  `ipAddress` and `userAgent` into `afterSnapshot`, and
  `services/api/src/modules/audit/audit.controller.ts:19-26` serves those rows to
  any user with `audit.read` in that tenant:
  ```ts
  return this.auditService.listByTenant(user.tenantId, query);
  ```

- **Current behaviour:** `GET /api/public/tenants/resolve?slug=victimco&host=attackerco.<base-domain>`
  builds the key `tenant:resolve:slug:victimco`, resolves the tenant by
  `attackerco.<base-domain>` (because `host` wins in the resolver), and stores the
  **attacker's** tenant under the **victim's** slug key for 300 seconds. For the
  next 300 s, every caller asking for `slug=victimco` — including
  `AuthService.resolveLoginTenant` — is told that slug belongs to the attacker's
  tenant id.

- **Expected behaviour:** The cache key must be derived from the tenant that was
  actually resolved (e.g. `tenant:resolve:id:<resolvedTenantId>` plus alias keys
  written only for the discriminators that actually produced the match), or the
  two precedence orders must be identical and a request carrying conflicting
  discriminators must be refused with a 400.

- **Risk:** Concretely, three effects, all from one unauthenticated GET:
  1. **Total login outage for an arbitrary tenant.** Every employee of `victimco`
     is looked up in the attacker's tenant, is not found, and receives
     `AUTH_INVALID_CREDENTIALS`. Repeatable forever; the endpoint has no rate limit.
  2. **Cross-tenant disclosure.** Each failed attempt writes the victim
     employee's email address, IP address and user-agent into the attacker's
     `AuditLog`, readable in the attacker's own admin UI. This is a working
     harvester for the victim tenant's user directory and sign-in times.
  3. **Login-page misdirection.** `apps/web/app/(public)/login/company-code-login-step.tsx:36-45`
     resolves a typed company code by `slug` and then
     `window.location.assign(buildTenantLoginUrl(data.tenant.slug))` — sending the
     user to the attacker's workspace login page under the attacker's branding.

- **Remediation:** In `PublicTenantsService.resolve`, compute the cache key *after*
  resolution from the resolved tenant, and index aliases explicitly:
  `tenant:resolve:slug:<tenant.slug>`, `tenant:resolve:code:<tenant.tenantCode>`,
  `tenant:resolve:domain:<matched domain>`. Reject a request that supplies more
  than one discriminator, or make `buildCacheKey`'s precedence identical to
  `findTenantForPublicResolution`'s. Add `PublicRateLimitGuard` to
  `PublicTenantsController`. Add a spec asserting that
  `resolve({slug: A, host: B})` never stores tenant B under a key naming A.

- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### CACHE-02 — The same endpoint lets an unauthenticated caller insert unbounded entries into a process-wide `static` Map

- **Category:** Availability / Resource exhaustion
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/tenants/public-tenant-cache.service.ts`

- **Evidence:**

  The `slug` query parameter is only trimmed and lower-cased on the caching path —
  `assertValidTenantSlug` is never reached when `host` is also present:

  `services/api/src/common/utils/slug.util.ts:26-28`
  ```ts
  export function normalizeTenantSlug(value: string) {
    return value.trim().toLowerCase();
  }
  ```

  `services/api/src/modules/tenants/public-tenants.service.ts:274`
  ```ts
  slug: input.slug ? normalizeTenantSlug(input.slug) : undefined,
  ```

  The store has no size cap and no sweep; entries are only removed lazily on a
  `get` of that exact key:

  `services/api/src/modules/tenants/public-tenant-cache.service.ts:15-30`
  ```ts
  get<T>(key: string): T | null {
    const entry = PublicTenantCacheService.sharedCache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      PublicTenantCacheService.sharedCache.delete(key);
  ```

  There is no DTO on the controller — `@Query('slug')` is a raw string with no
  `MaxLength` (contrast `LoginDto` at `modules/auth/dto/login.dto.ts:29-33`, which
  does constrain the same value).

- **Current behaviour:** Each request of the shape
  `?slug=<arbitrary string>&host=<any valid tenant hostname>` resolves
  successfully and permanently allocates a new Map entry holding a full branding
  payload (~1 KB). Nothing ever reads those keys again, so nothing ever evicts
  them. The API runs as a **single instance** (`render.yaml:47-52` — a Render disk
  pins the service to one instance), so this is the whole platform's heap.

- **Expected behaviour:** Cache keys should be drawn from a bounded set (resolved
  tenants), the cache should have a maximum size with an eviction policy, and the
  public endpoint should validate and bound its query parameters.

- **Risk:** An unauthenticated attacker drives API memory growth at roughly
  1 KB per request with no rate limit in front of it, until the Node heap is
  exhausted and the single API instance restarts.

- **Remediation:** Same key fix as CACHE-01 (keys become bounded by tenant count
  automatically), plus a `MaxLength`/pattern-validated DTO on
  `PublicTenantsController.resolve` and a hard entry cap in
  `PublicTenantCacheService.set`.

- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### CACHE-03 — Authenticated document view and download responses set no `Cache-Control` at all

- **Category:** Sensitive data exposure
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/documents/documents.controller.ts`

- **Evidence:**

  `services/api/src/modules/documents/documents.controller.ts:170-178` — the view
  handler sets only content headers:
  ```ts
  response.setHeader('Content-Type', document.mimeType ?? 'application/octet-stream');
  response.setHeader('Content-Disposition', `inline; filename="${document.originalFileName}"`);
  return new StreamableFile(file.stream);
  ```
  and `:188-200` does the same for `download`. No `Cache-Control`, no `Pragma`,
  no `Vary`.

  Every other sensitive binary endpoint in the codebase *does* set it, which is
  what makes this an inconsistency rather than a house style:
  - `modules/payslips/payslips.controller.ts:167` — `'private, no-store'`
  - `modules/payslips/payslips.controller.ts:219` — `'private, no-store'`
  - `modules/timesheets/timesheet-exports.controller.ts:75` — `'private, no-store'`
  - `modules/payroll/employer-bank-accounts.controller.ts:129,146` — `'no-store'`
  - `modules/employees/employees.controller.ts:722` — `'private, max-age=300'`

  `services/api/src/main.ts` installs no global cache-header middleware (there is
  no `helmet`, no default header layer) — verified by reading the whole
  bootstrap, `main.ts:38-110`.

- **Current behaviour:** Tenant documents — the store that holds ID scans,
  contracts, and employee document uploads — are served with no caching directive.
  The browser is free to write them to its on-disk HTTP cache, where they survive
  logout and are readable by the next person on a shared workstation. The proxy
  forwards whatever the API sent: `apps/web/lib/server-api.ts:488` —
  `copyHeaderIfPresent(response.headers, headers, "cache-control")` — so the
  absence propagates.

- **Expected behaviour:** `Cache-Control: private, no-store` on every
  authenticated file response, matching the payslip and timesheet handlers.

- **Risk:** Persistence of tenant-confidential files in browser disk caches on
  shared or unmanaged devices. Not remotely exploitable; it is a data-at-rest
  exposure on the client.

- **Remediation:** Add `response.setHeader('Cache-Control', 'private, no-store')`
  to `DocumentsController.view` and `.download`. Consider a small Nest interceptor
  that applies `private, no-store` by default to every non-`@Public()` handler,
  with an explicit opt-out — that closes the class of defect rather than one
  instance.

- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### CACHE-04 — Every in-process cache is per-replica; invalidation reaches only the instance that served the write

- **Category:** Correctness / Scalability
- **Severity:** LOW today, HIGH the day the API scales out
- **Confidence:** CONFIRMED
- **Known:** KNOWN — `docs/knowledge/architecture/settings-and-configuration.md:88-98`
- **Component:** all five stateful caches (#1–#5 in the inventory)

- **Evidence:**

  `docs/knowledge/architecture/settings-and-configuration.md:90,97-98`
  ```
  Two in-process caches, neither shared between replicas:
  ...
  Under more than one API replica, invalidation reaches only the instance that
  served the write. Everyone else serves stale values for up to 30 s / 300 s.
  ```

  The audit adds three more caches to that list with the same property:
  `tenant-entitlement.service.ts:97-99` (`this.cache.delete(tenantId)`),
  `active-organization.service.ts:53-55`, and the `static` map at
  `public-tenant-cache.service.ts:11` (static is per-*process*, not per-cluster).

  It is latent rather than live because the API is single-instance by
  construction — `render.yaml:45-52`:
  ```
  # TRADEOFF: a Render disk pins this service to a SINGLE INSTANCE — it cannot
  # be attached to a horizontally scaled service. `starter` runs one instance,
  ```

- **Current behaviour:** Correct today. One instance, one cache, invalidation
  always lands.

- **Expected behaviour:** Either the caches carry a shared invalidation channel,
  or the constraint "the API must not be scaled horizontally while these caches
  hold authorisation-adjacent state" is written into the deploy configuration
  rather than into a knowledge note.

- **Risk:** The first horizontal scale-out silently reintroduces up to 300 s of
  cross-instance staleness on tenant branding, 60 s on plan entitlement, and 60 s
  on a user's resolved organization. Nothing in CI or `render.yaml` would flag it.

- **Remediation:** Add a comment and an assertion at the point of scale-out —
  e.g. a startup warning in `main.ts` when `WEB_CONCURRENCY`/instance count > 1 and
  any TTL cache is registered. Long term this is the Redis trigger (see Part B).

- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** LATER

---

### CACHE-05 — A revoked plan entitlement keeps working for up to 60 seconds, and indefinitely during a database fault

- **Category:** AuthZ freshness
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** KNOWN (mechanism documented in-file; `BUG-1952`, Status FIXED, is the feature that introduced it)
- **Component:** `services/api/src/common/security/tenant-entitlement.service.ts`

- **Evidence:**

  `tenant-entitlement.service.ts:38`
  ```ts
  export const ENTITLEMENT_CACHE_TTL_MS = 60_000;
  ```

  `tenant-entitlement.service.ts:223-227` — an expired snapshot is served
  **without a bound** when the lookup faults:
  ```ts
  if (cached) {
    this.logger.warn(`Entitlement lookup failed for tenant ${tenantId}; serving the last known snapshot. ...`);
    return { snapshot: cached.snapshot, stale: true };
  }
  ```

- **Quantified staleness:**
  - Plan downgrade / subscription lapse: up to **60 s** before the gate sees it.
  - Tenant module override written through the control plane: **0 s** —
    `invalidate(tenantId)` at `:97-99` is called on the write path.
  - Database unreachable: **unbounded** — the last snapshot is served for as long
    as the fault lasts, however many hours that is.

- **Current behaviour:** As designed, and the design reasoning is written out at
  `:29-37` and `:216-222`. Entitlement is explicitly not treated as a security
  boundary, and `decide()` returns `allowed: true` for a tenant with no live
  subscription (`:171-178`) so an unpaid invoice cannot lock a tenant out of its
  own data.

- **Expected behaviour:** Acceptable, with one gap: the unbounded stale-serve
  should have a ceiling.

- **Risk:** A tenant that downgrades keeps a paid module for a minute — commercial
  leakage, not a security break. During a long DB outage, a tenant that was
  downgraded before the outage keeps the module until the outage ends.

- **Remediation:** Cap the stale-serve — e.g. refuse to serve a snapshot older
  than `ENTITLEMENT_CACHE_TTL_MS * 60` and fall through to `UNRESOLVABLE` (the
  503 path the guard already implements). One constant and one comparison in
  `resolve()`.

- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### CACHE-06 — Nothing invalidates the public tenant cache when a tenant is suspended, and `PublicTenantsService.invalidateTenant` has no callers

- **Category:** Correctness / dead code
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** PARTIALLY KNOWN — `docs/knowledge/architecture/settings-and-configuration.md:100-102` records the dead `tenant:branding:` key but not the missing status invalidation
- **Component:** `services/api/src/modules/tenants/public-tenants.service.ts`

- **Evidence:**

  `public-tenants.service.ts:114-117`
  ```ts
  invalidateTenant(tenantId: string) {
    this.cache.deleteByPrefix('tenant:resolve:');
    this.cache.delete(`tenant:branding:${tenantId}`);
  }
  ```
  A repository-wide grep for callers finds none outside the file itself:
  `grep -rn "invalidateTenant(" services/api/src` returns only this definition and
  the unrelated `active-organization.service.ts:57`.

  The only thing that actually clears the resolve cache is the settings service,
  and only for branding/profile writes:
  `modules/tenant-settings/tenant-settings.service.ts:756-765`
  ```ts
  if (!tenantProfileChanged && !brandingChanged) { return; }
  this.publicTenantCacheService.deleteByPrefix('tenant:resolve:');
  this.publicTenantCacheService.delete(`tenant:branding:${tenantId}`);
  ```
  Nothing writes a `tenant:branding:` key anywhere, so both `delete` calls are
  no-ops.

  Tenant status *is* part of the cached payload —
  `public-tenants.service.ts:315-322` returns `status: tenant.status` — and the
  active check runs before caching, not on read (`:106`).

- **Current behaviour:** A tenant suspended by platform operations continues to
  resolve as `ACTIVE` on its login page for up to 300 s.

- **Expected behaviour:** A tenant status transition should evict the tenant's
  resolve entries.

- **Risk:** Cosmetic only, and this is worth stating precisely: `AuthService.login`
  re-checks status live at `:274-280` and `loadAccessContext` at
  `auth-access.service.ts:137-150` rejects a non-ACTIVE tenant, so **no one can
  actually sign in or keep a session**. The user sees a normal login form instead
  of the suspension notice for up to five minutes.

- **Remediation:** Call `PublicTenantsService.invalidateTenant` from the tenant
  status transition in `tenant-operations.service.ts` / `super-admin`, delete the
  dead `tenant:branding:` lines, and narrow `deleteByPrefix` once CACHE-01 gives
  the entries a tenant-derived key.

- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### CACHE-07 — One tenant's branding change flushes every tenant's resolve entry

- **Category:** Performance / blast radius
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/tenant-settings/tenant-settings.service.ts:764`

- **Evidence:**
  `tenant-settings.service.ts:764`
  ```ts
  this.publicTenantCacheService.deleteByPrefix('tenant:resolve:');
  ```
  `public-tenant-cache.service.ts:36-42` iterates the whole shared map and deletes
  every key under that prefix, regardless of tenant.

- **Current behaviour:** Any tenant admin saving a branding or tenant-profile
  setting evicts the cached login resolution for **every** tenant on the instance.
  It fails in the safe direction (a cold read is correct, just slower).

- **Expected behaviour:** Evict only the saving tenant's entries.

- **Risk:** A thundering-herd of `tenantDomain.findUnique` / `tenant.findUnique`
  on the shared login path after every branding save. Immaterial at today's tenant
  count; it scales with tenants × branding-save frequency.

- **Remediation:** Once CACHE-01 rekeys entries by resolved tenant, replace this
  with `deleteByPrefix('tenant:resolve:') → deleteByTenant(tenantId)`, or maintain
  a `tenantId → keys` reverse index in `PublicTenantCacheService`.

- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### CACHE-08 — `PUBLIC_TENANT_RESOLVE_CACHE_TTL_SECONDS` is read but registered nowhere

- **Category:** Configuration drift
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/tenants/public-tenant-cache.service.ts:46`

- **Evidence:**
  `public-tenant-cache.service.ts:44-50`
  ```ts
  const seconds = Number(
    this.configService.get('PUBLIC_TENANT_RESOLVE_CACHE_TTL_SECONDS') ?? 300,
  );
  ```
  A repo-wide search across `*.yaml`, `*.yml`, `*.ts`, `*.js` and `*.md`
  (excluding `node_modules`) returns exactly two hits: this line and the knowledge
  note that documents it. It is absent from `packages/config` env validation,
  `turbo.json` `globalEnv`, `render.yaml` and `docs/environment-variables.md` —
  the four places `AGENTS.md` requires a new env var to appear.

- **Current behaviour:** The TTL is unconfigurable in practice; production always
  runs the 300 s default, and an operator setting the variable on Render would find
  it did not survive a `turbo` build boundary.

- **Expected behaviour:** Registered in all four places, or deleted in favour of a
  named constant.

- **Risk:** Operational only — an operator cannot shorten the window that CACHE-01
  and CACHE-06 depend on.

- **Remediation:** Register the variable, or replace it with an exported constant
  in the service the way `ENTITLEMENT_CACHE_TTL_MS` is done.

- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### CACHE-09 — The settings resolver hands out the cached object by reference

- **Category:** Correctness (latent)
- **Severity:** LOW
- **Confidence:** LIKELY — the unverified link is that I found no caller that mutates the returned map; I read the direct consumers in `tenant-settings-resolver.service.ts` and they only read, but I did not trace all eleven direct `TenantSetting` readers the knowledge note describes.
- **Component:** `services/api/src/modules/tenant-settings/tenant-settings-resolver.service.ts`

- **Evidence:**
  `tenant-settings-resolver.service.ts:1741-1745,1767-1772`
  ```ts
  const cached = this.cache.get(scopeKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  ...
  this.cache.set(scopeKey, { value: settings, expiresAt: now + 30_000 });
  return settings;
  ```
  The freshly-built object is `structuredClone`d from the defaults (`:1757`) but
  the *cached* object is returned directly, uncloned, to every caller for 30 s.

- **Current behaviour:** Every caller within the TTL shares one mutable
  `SettingsMap` instance for that tenant.

- **Expected behaviour:** Return a frozen or cloned view, or document the
  read-only contract at the return site.

- **Risk:** A future caller that writes into the returned map (an overlay, a
  defaulting pass) would silently corrupt that tenant's settings for the rest of
  the TTL — for every request on the instance, not just its own. It cannot cross
  a tenant boundary, because the key is the tenant.

- **Remediation:** `Object.freeze` the category objects on `set`, or return
  `structuredClone(cached.value)`. Freezing is cheaper and turns the mistake into
  a throw in strict mode.

- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### CACHE-10 — No cache key in the API omits the tenant where it holds tenant data

- **Category:** Tenant Isolation
- **Severity:** INFORMATIONAL
- **Confidence:** NOT OBSERVED (searched for specifically)
- **Known:** NEW
- **Component:** whole API

This is the negative result the brief asked for, and it is a real one. I looked
for exactly the failure mode described — a process-level cache keyed on a settings
key, permission key, entity name or module key that holds tenant data — and it does
not exist:

- `grep -rIn "private (readonly )?[A-Za-z_$]+ *= *new Map" services/api/src` returns
  twelve instance-level maps; every one that holds tenant data keys on `tenantId`
  (`tenant-entitlement.service.ts:82`, `active-organization.service.ts:17`,
  `tenant-settings-resolver.service.ts:489`, `customization.service.ts:66-70`,
  `agent.service.ts:142`, `dlp.service.ts:61`).
- The two keyed on something *else* — `module-registry.service.ts:205` (`moduleKey`)
  and `standard-report.registry.ts:519` (`key`) — hold values derived from compiled
  constants and the generated Prisma schema JSON, not from any database row.
  `module-registry.service.ts:230-300` builds its descriptor purely from
  `MODULE_DEFINITIONS` and `loadRuntimeSchema()`.
- `grep -rIn "^(let|var) " services/api/src` finds exactly one module-level mutable
  binding, `module-registry.service.ts:35 let cachedSchema` — a lazily-required
  build artefact.
- **No caching whatsoever in the authentication or authorization path.**
  `JwtAuthGuard.canActivate` (`common/guards/jwt-auth.guard.ts:44-136`) calls
  `AuthAccessService.loadAccessContext` on **every** request with no memoisation,
  and `PermissionsGuard` (69 lines, `common/guards/permissions.guard.ts`) touches
  no database and no cache at all. A revoked role, a removed permission, a
  deactivated user and a revoked session all take effect on the **next request** —
  zero staleness. That is the single most important thing this audit checked.
- No `@nestjs/cache-manager`, `CacheModule`, `CacheInterceptor`, `lru-cache`,
  `node-cache` or `keyv` anywhere in `services/api` or `packages`.
- No Prisma cache extension; `PrismaService` (`common/prisma/prisma.service.ts:18`)
  extends `PrismaClient` with no caching `$extends`.
- No Redis. `modules/notifications/queues/notification-queue.service.ts:27-31`
  reads `REDIS_HOST` only to report that the BullMQ worker is *not* wired and the
  synchronous fallback is active; `modules/outbox/outbox-worker.service.ts:20`
  states the deliberate decision not to introduce a broker.

---

### CACHE-11 — Every server-side API call opts out of Next's per-render fetch deduplication, and `/tenant-settings/resolved` is consequently fetched twice on nine pages

- **Category:** Performance
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW (adjacent to `docs/knowledge/architecture/web-architecture.md:70-76`, which records that nothing is cached, but not this)
- **Component:** `apps/web/lib/server-api.ts`, `apps/web/app/(authenticated)/`

- **Evidence:**

  Next's dedupe wrapper opts out whenever the caller passes an `AbortSignal`:

  `node_modules/next/dist/server/lib/dedupe-fetch.js` (next 16.3.1)
  ```js
  return function dedupeFetch(resource, options) {
      if (options && options.signal) {
          // If we're passed a signal, then we assume that
          // someone else controls the lifetime of this object and opts out of caching.
          return originalFetch(resource, options);
      }
  ```

  `apps/web/lib/server-api.ts:132-140` always passes one:
  ```ts
  let response = await fetch(url, {
    ...init, method, headers,
    signal: mergeAbortSignals(init.signal, controller.signal),
    cache: init.cache ?? "no-store",
  });
  ```

  The layout fetches tenant settings once, memoised by hand with React `cache()`:

  `apps/web/app/(authenticated)/layout.tsx:42-46`
  ```ts
  const getResolvedTenantSettings = cache(() =>
    apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved").catch(() => null),
  );
  ```
  It is a module-local `const`, not exported, so no page can reuse it. Nine pages
  fetch the same endpoint again in the same render:
  `attendance/page.tsx:33`, `attendance/[entryId]/edit/page.tsx:25`,
  `employees/new/page.tsx:43`, `employees/page.tsx:119`,
  `employees/[employeeId]/edit/page.tsx:56`, `employees/[employeeId]/page.tsx:52`,
  `leaves/page.tsx:46`, `my-profile/page.tsx:85`, `(authenticated)/page.tsx:26`.

  `apps/web/app/(authenticated)/attendance/page.tsx:30-35`
  ```ts
  const [sessionUser, resolvedSettings, attendanceContext] = await Promise.all([
    getSessionUser(),
    apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved").catch(() => null),
  ```

- **Current behaviour:** Rendering `/attendance` issues at least seven API calls —
  five from the layout (`layout.tsx:43,130,143,155` plus
  `_lib/business-unit-access.ts:22`), one from `getSessionUser`, and the page's own
  — of which `/tenant-settings/resolved` is a verbatim duplicate. Because each call
  passes an abort signal, Next collapses none of them.

- **Expected behaviour:** Identical GETs within one render should resolve to one
  upstream request. The codebase already knows the pattern (`React.cache` is used
  at `layout.tsx:42` and `app/layout.tsx:116`); it is applied in two places out of
  hundreds.

- **Risk:** Doubled latency and doubled backend load on the hottest endpoint of
  every page. Each duplicate carries the full authenticated-request cost measured
  in CACHE-12.

- **Remediation:** Export the memoised readers from a shared module —
  `apps/web/lib/server-reads.ts` exposing `getResolvedTenantSettings()`,
  `getTenantFeatures()`, `getBusinessUnitAccessSummary()` each wrapped in
  `cache()` — and have layout and pages call those instead of `apiRequestJson`
  directly. `React.cache` is request-scoped, so this introduces **zero** staleness.
  Separately, drop the abort signal when the caller did not supply one (keep the
  timeout via `AbortSignal.timeout` inside `init` only when explicitly requested),
  so Next's own dedup starts working for the rest.

- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** YES

---

### CACHE-12 — Roughly two dozen SQL statements run before any controller does, on every authenticated request

- **Category:** Performance
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (read end to end; the query *count* is derived from Prisma's relation-load strategy, which the schema does not opt out of — see below)
- **Known:** NEW
- **Component:** `services/api/src/common/guards/jwt-auth.guard.ts`, `modules/auth/auth-access.service.ts`

- **Evidence:**

  `jwt-auth.guard.ts:98-106,134` — four distinct database phases per request:
  ```ts
  await this.assertSessionIsActive(payload, clientId);
  const { authUser } = ... await this.authAccessService.loadAccessContext(payload.sub, payload.tenantId);
  ...
  await this.assertTimesheetRestrictionAllowsRequest(request);
  ```

  1. `refreshToken.findFirst` — `jwt-auth.guard.ts:305-317`.
  2. `tenantSetting.findFirst` for the idle timeout — `jwt-auth.guard.ts:360-368` —
     which runs on every `web` request because sliding sessions default **on**:
     `common/config/auth.config.ts:235-237`
     ```ts
     return configService.get<string>('SESSION_SLIDING_ENABLED') !== 'false';
     ```
     This read bypasses the 30 s settings resolver entirely and goes straight to
     `TenantSetting` (trap 5 in `docs/knowledge/architecture/settings-and-configuration.md:216-221`).
  3. `loadAccessContext` — `auth-access.service.ts:72-137` — one `user.findUnique`
     with **19 nested relation loads**: tenant, businessUnit→organization,
     employee, userPermissions→permission, userRoles→role→(rolePermissions→
     permission, rolePrivileges, miscPermissions), teamMemberships→team→teamRoles→
     role→(rolePermissions→permission, rolePrivileges, miscPermissions).
     The generator block declares no `relationJoins` preview feature —
     `services/api/prisma/schema.prisma:6-9`
     ```
     generator client {
       provider   = "prisma-client-js"
       engineType = "client"
     }
     ```
     so each `include` is a separate round trip.
  4. `businessUnit.findMany` over the **entire tenant** — `auth-access.service.ts:337-344`:
     ```ts
     const businessUnits = await this.prisma.businessUnit.findMany({
       where: { tenantId },
       select: { id: true, organizationId: true, parentBusinessUnitId: true },
     });
     ```
  5. `employee.findFirst` + `timesheetAccessRestriction.findFirst` —
     `jwt-auth.guard.ts:197-214`.

- **Current behaviour:** ~24 SQL statements before the handler runs. Multiply by
  CACHE-11: rendering one authenticated page is 7+ API calls, so **~170 SQL
  statements of pure auth overhead per page view**, against a single Render
  `starter` instance and a Neon database.

- **Expected behaviour:** The permission grant must stay live (see Part B tier 6 —
  it must not be cached). The *fan-out* is what should shrink.

- **Remediation, in the order that pays:**
  1. Fix CACHE-11 first — it removes duplicate whole-chains, not just queries.
  2. Enable Prisma's `relationJoins` preview feature and re-measure; the 19
     relation loads collapse toward one query with lateral joins. This is a schema
     generator change, not a caching change, and needs its own ExecPlan under
     `PLANS.md` because it changes every `include` in the codebase.
  3. Move the idle-timeout read (phase 2) onto `TenantSettingsResolverService`,
     which already caches that tenant's settings for 30 s — one line, and it
     deletes a per-request query outright.
  4. Cache the business-unit tree per tenant (Part B recommendation B3).

- **Difficulty:** MEDIUM (items 1, 3) / HIGH (item 2)
- **Regression risk:** LOW (1, 3) / MEDIUM (2)
- **Fix now:** LATER — but item 3 is a one-line YES.

---

### CACHE-13 — `cacheKeys` / `cachePartitionKey` exist in the web runtime and nothing caches on them

- **Category:** Dead abstraction
- **Severity:** INFORMATIONAL
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/web/lib/runtime/`

- **Evidence:**
  `apps/web/lib/runtime/tenant-runtime.resolver.ts:152`
  ```ts
  cachePartitionKey: `tenant:${tenantSlug}`,
  ```
  It is composed into `runtime.cacheKeys` (`module-runtime.resolver.ts:103-104`,
  `modules/employee-metadata.adapter.ts:486-487`,
  `modules/standard-module-runtime.ts:207`) and the only consumer treats the array
  as a boolean:
  `apps/web/lib/runtime/command-execution.service.ts:130-134`
  ```ts
  status: result.invalidateCacheKeys?.length ? "refreshRequired" : "success",
  ...
  refreshRequired: Boolean(result.invalidateCacheKeys?.length),
  ```
  `docs/architecture/module-runtime-overhaul.md:351,377` describes the intended
  cache these keys were designed for. It was never built.

- **Risk:** None operationally. It is a trap for the next engineer, who will
  reasonably assume the runtime caches metadata and that these keys partition it.
  The keys *are* tenant-scoped, so building the cache on them would be safe.

- **Remediation:** Either delete the vestigial fields or add a one-line comment at
  `tenant-runtime.types.ts:50` saying no cache reads them yet.

- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO

---

## Part B — where caching would genuinely help

### The governing observation

The platform's performance problem is not a missing cache. It is that the same
work is requested repeatedly within a single page render (CACHE-11) and that one
authorization check costs two dozen queries (CACHE-12). **Both are fixed by
deduplication and query shape, not by a cache**, and both must be fixed before any
new cache is considered — a cache layered over CACHE-11 would memoise a request
that should not have been made twice.

### The six tiers

**Tier 1 — safe to cache, long TTL (hours to process lifetime).**
Data derived from compiled constants or build artefacts, identical for every
tenant and every user.
- The generated Prisma runtime schema (`module-registry.service.ts:35`) — already
  cached permanently, correctly.
- `MODULE_DEFINITIONS` descriptors (`module-registry.service.ts:205`) — already
  cached permanently, correctly.
- The RBAC matrix catalog and permission catalog (`common/constants/rbac-matrix.ts`,
  `common/constants/permissions.ts`) — these are already module constants; the
  endpoints that serve them (`/roles/matrix/catalog`) do transform work per call
  that could be computed once at module init.
- Published legal documents and the commercial config — already HTTP-cached, tier 2
  in practice because publication must land quickly.

**Tier 2 — cacheable with a short TTL (30–300 s), no invalidation hook required.**
Public, non-authorizing data where a brief lag is acceptable and the read volume
is high.
- Public tenant branding / login resolution — cached today at 300 s (fix CACHE-01
  first).
- `/public/commercial-config` — 60 s HTTP, correctly `Vary`'d on country.
- `/public/legal` and `/public/legal/:slug` — 300 s HTTP.
- Geographic reference data (countries, states, cities) — currently persisted in
  Postgres and refreshed from an internet source
  (`modules/lookups/geographic-lookup.service.ts`); the DB *is* the cache and that
  is the right design.

**Tier 3 — cacheable only with explicit invalidation.**
- Tenant settings — cached today at 30 s with `invalidateTenantCache` on every
  write. Correct.
- Tenant plan entitlements — cached today at 60 s with control-plane invalidation.
  Correct, subject to CACHE-05's stale-serve ceiling.
- Customization / module metadata (the `cacheKeys` design in CACHE-13) — would
  qualify, if the invalidation hooks at `customization.service.ts:901-922` were
  wired to a real cache.

**Tier 4 — user-specific cache (key MUST contain userId).**
- A user's resolved active organization — cached today at 60 s keyed
  `tenantId:userId`. Correct.
- Nothing else qualifies. In particular a user's permission set does **not** —
  see tier 6.

**Tier 5 — tenant-specific cache (key MUST contain tenantId).**
- The tenant's business-unit tree — see recommendation B3 below.
- The tenant's settings map — already tier 3.
- Tenant branding — already tier 2/3.

**Tier 6 — MUST NOT be cached.** This is the required deliverable, and it is
complete for this codebase:

| Must not cache | Why |
|---|---|
| **Permission grants and role membership** (`AuthAccessService.loadAccessContext`) | A revoked permission must stop working on the next request, not on the next TTL. This is the one place a 60 s cache converts a deliberate revocation into a 60 s privilege window. Today it is uncached and must stay that way. |
| **Session liveness** (`JwtAuthGuard.assertSessionIsActive`) | "Sign out all devices", a suspended account, and an admin revoking a session are security actions whose entire value is immediacy. Caching the `refreshToken` lookup would keep a revoked session alive for the TTL. |
| **`hasElevatedTenantRole` / elevated-role membership** | `AGENTS.md` records that this list bypasses `PermissionsGuard` entirely. Anything that widens the window on it is a privilege-escalation window. |
| **Row-level scope decisions** (`buildScopedAccessWhere`, `resolveEffectiveAccessLevel`) | These are computed from the live access context per query; caching the resulting `where` fragment across requests would pin a user to a stale org/team/business-unit shape after a transfer. |
| **Field security masks** (`tenant-settings/field-security.controller.ts`) | Same class: a newly-masked field must be masked on the next read. |
| **Tenant status** (ACTIVE / SUSPENDED / DECOMMISSIONING) | Suspension is a platform enforcement action. CACHE-06 shows what caching it looks like even when the impact is only cosmetic. |
| **Employee status and `isDeleted`** | A terminated employee must disappear from approver pools, payroll runs and directory reads immediately; a cached "ACTIVE" keeps routing work to them. |
| **Payroll figures — run totals, line items, payslip amounts** | Money that is computed, then displayed, then paid. A stale figure is a wrong payment, and `payslips.controller.ts:167,219` and `payroll-operations.controller.ts` already declare `no-store` for exactly this reason. Payroll runs also mutate through DRAFT→CALCULATING→CALCULATED→REVIEWED→LOCKED→PAID; a cache would show a state that has already advanced. |
| **Leave balances and accruals** | Derived from approved requests plus accrual runs, and consumed as an eligibility check at submission time. A stale balance lets an employee book leave they no longer have, which is then a correction against a paid period. |
| **Approval and workflow instance state** | Anything mid-workflow. Two approvers acting concurrently on a cached "PENDING" produce a double decision; an SLA timer read from a cache misses its own breach. |
| **Timesheet access restrictions** (`jwt-auth.guard.ts:197-214`) | An access restriction is imposed precisely because someone must be stopped *now*. |
| **Anything in the outbox / notification queue path** | Delivery state is a durability guarantee. A cached "already dispatched" is a lost notification; a cached "not dispatched" is a duplicate. |
| **Audit log reads** | An auditor reading a stale window cannot distinguish "nothing happened" from "the cache has not caught up", which defeats the purpose of the record. |

### Recommendations

Each carries all seven required fields. There are three, deliberately — the
evidence supports these and not more.

---

**B1 — Deduplicate identical server-side reads within one render (this is the fix, not a cache)**

- **What is cached:** Nothing persistent. The *result of one GET within one
  server render pass* is memoised by React's request-scoped `cache()`.
- **Where it lives:** A new `apps/web/lib/server-reads.ts` exporting
  `getResolvedTenantSettings()`, `getTenantFeatures()`,
  `getBusinessUnitAccessSummary()`, `getSessionUser()`, each `cache()`-wrapped;
  layout and pages call these instead of `apiRequestJson` directly.
- **Exact cache key:** React's `cache()` keys on the memoised function's
  arguments *within a single request context*. Tenant and user isolation are
  structural — the memo does not outlive the request, and the request already
  carries exactly one user's cookies. There is no cross-request store to leak
  from.
- **TTL:** The lifetime of one server render. Milliseconds.
- **Invalidation trigger:** None needed. The memo dies with the request.
- **Expected benefit:** Removes one full duplicate API call —
  `/tenant-settings/resolved` — from nine measured pages
  (CACHE-11 evidence), each duplicate costing the ~24-statement auth chain of
  CACHE-12. Roughly a 15% reduction in API calls per page render and ~24 fewer SQL
  statements per affected page, before counting the other four layout reads that
  pages also re-issue.
- **Stale-data risk:** **Zero.** This is the reason to do it first: it is
  strictly a deduplication, and no value survives the request that produced it.

---

**B2 — Move the sliding-session idle-timeout read onto the existing settings resolver**

- **What is cached:** The tenant's `security.idleTimeoutMinutes` setting — already
  cached, just not by this caller.
- **Where it lives:** The existing `TenantSettingsResolverService` cache
  (`tenant-settings-resolver.service.ts:489`). No new cache is created.
- **Exact cache key:** `tenantId` (or `tenantId:organizationId`) — the resolver's
  existing key. Tenant isolation is the key itself; the value is not user-specific.
- **TTL:** 30 s, the resolver's existing TTL.
- **Invalidation trigger:** `invalidateTenantCache(tenantId)`, already called on
  every settings write at `tenant-settings.service.ts:324,462,586`.
- **Expected benefit:** Deletes one `tenantSetting.findFirst` from **every**
  authenticated `web` request (`jwt-auth.guard.ts:360-368`, reached whenever
  `SESSION_SLIDING_ENABLED !== 'false'`, which is the default per
  `auth.config.ts:236`). At 7 API calls per page render that is 7 queries per page
  view removed for a one-line change.
- **Stale-data risk:** LOW and bounded at 30 s. The consequence of a stale value is
  that an admin who shortens the idle timeout sees it take effect up to 30 s later
  — for a setting measured in minutes and clamped to 15–1440
  (`jwt-auth.guard.ts:369`). Note this is a *security* setting, so the change must
  be reviewed on that basis; the 30 s bound is the argument that it is acceptable,
  and the current direct read is itself listed as trap 5 in the settings knowledge
  note precisely because it diverges from the resolver.

---

**B3 — Cache the per-tenant business-unit tree**

- **What is cached:** The `{id, organizationId, parentBusinessUnitId}` projection
  of every business unit in a tenant — the exact `select` at
  `auth-access.service.ts:337-343`.
- **Where it lives:** A new `Map` on `AuthAccessService`, following the shape of
  `ActiveOrganizationService` (`active-organization.service.ts:17-55`) so the
  pattern and its invalidation contract are already established in the codebase.
- **Exact cache key:** `tenantId`. Nothing user-specific is stored — the
  per-user filtering (`canAccessAllBusinessUnits`, `userOrganizationId`) happens
  *after* the cached fetch, at `auth-access.service.ts:346-354`, and must stay
  outside the cache. This is the isolation boundary: cache the tenant's tree,
  never the user's slice of it.
- **TTL:** 60 s.
- **Invalidation trigger:** An explicit `invalidateTenant(tenantId)` called from
  every `BusinessUnit` create/update/delete path in `modules/organization/`, on
  the model of `ActiveOrganizationService.invalidateUser` being called from
  `users.service.ts:266`. The TTL is the backstop, not the mechanism.
- **Expected benefit:** Removes one unbounded `findMany` over a whole tenant's
  business units from every authenticated request (~7 per page render). The cost
  it removes grows with tenant size — a tenant with 200 business units pays for
  200 rows on every single API call today, including a payslip download.
- **Stale-data risk:** LOW, bounded at 60 s with the invalidation hook, and it
  fails in a visible rather than a dangerous direction: a newly created business
  unit is briefly absent from a user's accessible list (they see less than they
  should), and a deleted one is briefly present (its id resolves to nothing
  downstream because every consuming query still filters `tenantId`). It cannot
  widen access across tenants because the key *is* the tenant. It **can** briefly
  widen access *within* a tenant if a business unit is moved between
  organizations — so the invalidation hook is required, not optional.

---

### Explicitly NOT recommended

- **Do not cache `loadAccessContext`.** It is the largest single per-request cost
  in the system and it is the most tempting thing to cache. It is also the
  permission grant. Fix its fan-out (CACHE-12 remediation items 2 and 4); do not
  put a TTL on it.
- **Do not introduce Redis yet.** See the threshold below.
- **Do not add Next.js `unstable_cache` / `revalidate` to `apps/web` or
  `apps/admin`.** `docs/knowledge/architecture/web-architecture.md:70-76` records
  that these apps have deliberately zero cache-invalidation surface, and every
  page is tenant- and user-specific behind a cookie. A `revalidate` on an
  authenticated App Router page is the classic route to serving one tenant's
  rendered HTML to another.
- **Do not add HTTP `public` caching to any authenticated API response.** The
  audit found none today and that must remain true.

### The trigger threshold for an external cache

Redis (or equivalent) becomes justified when **any one** of these is measurably
true:

1. **The API runs more than one instance.** This is the hard trigger. Today the
   Render disk pins it to one (`render.yaml:45-52`), so every in-process cache is
   coherent by accident of deployment. The moment a second instance exists,
   CACHE-04 becomes live: a tenant's branding change, a plan downgrade and a
   business-unit move each become stale on every instance except the one that
   served the write, for 300 s / 60 s / 60 s respectively.
2. **Sustained authenticated throughput exceeds ~50 req/s** to `services/api`,
   at which point the ~24-statement auth chain of CACHE-12 is ~1,200 statements/s
   of pure overhead against a single Neon endpoint.
3. **p95 latency of `GET /api/tenant-settings/resolved` exceeds 300 ms**, or p95
   of any authenticated GET exceeds 800 ms, with the database — not the Node
   process — identified as the contributor.
4. **The per-instance cache maps exceed ~5,000 tenants**, at which point
   `TenantEntitlementService.cache` and `TenantSettingsResolverService.cache` stop
   being negligible heap (neither has an eviction policy, only lazy expiry).

**What to fix before that point, in order:**

1. CACHE-01 and CACHE-02 — these are security fixes, not performance work, and
   they are independent of everything else here.
2. B1 — request-scoped deduplication. Free correctness-wise, largest single win.
3. B2 — the one-line settings-resolver reuse.
4. CACHE-12 item 2 — evaluate Prisma `relationJoins` under its own ExecPlan.
   Collapsing 19 relation round trips into lateral joins is worth more than any
   cache and carries no staleness at all.
5. B3 — the business-unit tree cache.
6. Move file storage off the Render disk to object storage. **This is the real
   prerequisite for horizontal scale**, and therefore the real prerequisite for
   needing Redis at all — `render.yaml:45-52` says so explicitly. Until that
   moves, the platform cannot scale out, and until it scales out, an external
   cache buys nothing that an in-process `Map` does not already provide.

---

## Healthy — verified good

- **No caching anywhere in the authentication or authorization path.**
  `common/guards/jwt-auth.guard.ts:98-134` resolves the session and the access
  context from the database on every request, and `common/guards/permissions.guard.ts`
  (69 lines) is pure computation over `request.user`. A revoked permission, a
  removed role, a deactivated user and a revoked session all take effect on the
  next request. This is the single most important property in a multi-tenant HRM
  and it holds.
- **Every cache that holds tenant data has the tenant in its key.**
  `tenant-entitlement.service.ts:82,204`, `tenant-settings-resolver.service.ts:1738-1743`,
  `active-organization.service.ts:30`, `customization.service.ts:4299`,
  `agent.service.ts:142`, `dlp.service.ts:61`. The only exception is CACHE-01, and
  there the tenant is in the key — it is just the *wrong* tenant.
- **The one user-scoped cache includes both tenant and user.**
  `active-organization.service.ts:30` — `` `${tenantId}:${userId}` `` — and its
  organization-scoped sibling in the settings resolver splits the tenant view from
  each organization view (`tenant-settings-resolver.service.ts:1738-1740`) rather
  than sharing one entry.
- **Cache invalidation on the settings write path is complete and correct.**
  `tenant-settings-resolver.service.ts:1715-1724` deletes the tenant key *and*
  every `${tenantId}:` organization-scoped key, with the reasoning written out at
  `:1709-1714`. This is the failure mode most settings caches get wrong.
- **No `Cache-Control: public` on any authenticated response.** Every `public`
  directive found is on a `@Public()` handler:
  `public-legal.controller.ts:35,43`, `public-billing.controller.ts:126`,
  `public-tenants.controller.ts:63-64`. Every authenticated one is `private` or
  `no-store`: `payslips.controller.ts:167,219`, `timesheet-exports.controller.ts:75`,
  `timesheets.controller.ts:399,445`, `payroll-operations.controller.ts:77,105,175,230,294`,
  `employer-bank-accounts.controller.ts:129,146`, `employees.controller.ts:722`,
  `dlp.controller.ts:150`.
- **The one market-varying public cache declares its `Vary` correctly.**
  `public-billing.controller.ts:125-126`
  — `@Header('Vary', 'cf-ipcountry, x-vercel-ip-country, x-country-code')` beside
  the `public, max-age=60`, with the reasoning at `:104-112` naming the exact
  failure it prevents.
- **Next.js' data cache keys on request headers, so the landing site's 60 s
  commercial-config cache cannot serve one market's prices to another.** Verified
  against the installed runtime, not assumed:
  `node_modules/next/dist/server/lib/incremental-cache/index.js:283,288-303` —
  `headers` is a member of the `cacheString` array that becomes the key.
- **`apps/web` and `apps/admin` cache nothing by construction.**
  `apps/web/lib/server-api.ts:140` — `cache: init.cache ?? "no-store"` — and
  `:101` — `const cookieStore = await cookies()` — which opts every enclosing
  route out of static generation. Zero `revalidate`, zero `unstable_cache`, zero
  `revalidateTag` in either app; the only `next: { revalidate }` in the repository
  is on the public landing site (`apps/landing/lib/commercial-config.ts:125`,
  `legal-server.ts:93,134`).
- **Next's client router cache is at its safe default.** No `experimental.staleTimes`
  override in any of the three `next.config.ts` files, so
  `node_modules/next/dist/server/config-shared.js:260-262` applies —
  `dynamic: 0`, meaning a back-navigation to an authenticated page re-fetches
  rather than replaying another user's data.
- **No client-side data cache.** No SWR, no React Query, no TanStack in any app's
  `package.json`. `localStorage` and `sessionStorage` hold only UI preferences —
  theme (`apps/web/lib/theme.ts:26,38`), sticky table columns
  (`app/components/data-table/data-table.tsx:149-170`), a save-notice flag
  (`module-record-page.tsx:686-703`), a remembered email in the desktop agent
  (`apps/agent-desktop/src/renderer/login.ts:532`) — no tenant records.
- **The entitlement cache fails closed on a cold miss and open on a warm one, and
  says why.** `tenant-entitlement.service.ts:216-233` — a DB blip serves the last
  snapshot rather than converting a paying tenant into an unentitled one; a cold
  cache returns `null`, which the guard renders as a retryable 503 rather than a
  403. The distinction is argued at `:190-198`. This is a well-made cache.
- **A tenant suspension cannot be ridden through the stale public cache.**
  `auth.service.ts:274-280` re-checks tenant status live on login and
  `auth-access.service.ts:137-150` rejects a non-ACTIVE tenant on every
  authenticated request, so CACHE-06's 300 s window is cosmetic rather than an
  authentication bypass. Checked specifically.

## Not examined / limits

- **No runtime measurement.** Every latency and query-count figure here is derived
  by reading code and configuration, not by executing a request against a running
  API. The "~24 SQL statements per authenticated request" of CACHE-12 is counted
  from Prisma's relation-load semantics given a generator block with no
  `relationJoins` preview feature; I did not attach a query logger and count them.
  Treat the count as a well-founded estimate and the *shape* (four phases, one
  unbounded `findMany`) as CONFIRMED.
- **CACHE-01 was not executed against a live environment.** The chain is read end
  to end in source — key construction, resolution precedence, the cache write, the
  login consumer, the audit write, the audit read — and each link is quoted above.
  I did not poison a live cache, because the briefing forbids writes and this
  audit runs against production infrastructure. The one link I could not verify by
  execution is whether production's `TENANT_BASE_DOMAIN` is configured such that
  `createSystemDomain` actually issued workspace-hostname rows for existing
  tenants; if it did not, the attacker needs a platform-created `CUSTOM_DOMAIN`
  row instead, which raises the bar but does not close the hole.
- **`node_modules` is not usable inside the audit worktree.** Its junction points
  at `D:\D:\My Work\...` and does not resolve. The three Next.js internals cited
  (`patch-fetch.js`, `dedupe-fetch.js`, `incremental-cache/index.js`,
  `config-shared.js`) were read from the primary checkout at
  `D:\My Work\hrm-dijipeople\DijiPeople\node_modules\next` — same declared
  version, `16.3.1`. No type-checking or test execution was attempted.
- **The `.NET gateway` (`gateway/`) and `tools/zkteco-poc/` were not examined for
  caching.** They are outside the Node/Next surface this area covers and would
  need a C#-aware pass.
- **`apps/admin`'s server-api was only spot-checked** (`apps/admin/lib/server-api.ts:211`
  forwards `cache-control` the same way `apps/web` does). I read `apps/web`'s in
  full and assumed parity; if admin diverges on the fetch defaults, that is
  unexamined.
- **CDN behaviour is inferred, not observed.** There is no `vercel.json` and no
  cache configuration in `render.yaml`, so I report platform defaults. I did not
  query a live edge to confirm what Vercel or Cloudflare actually does with the
  `public, max-age=300` on `/api/public/tenants/:slug/assets/:type`.
- **I did not trace all eleven direct `TenantSetting` readers** that
  `docs/knowledge/architecture/settings-and-configuration.md:216-221` describes.
  That is why CACHE-09 is LIKELY rather than CONFIRMED — one of those readers
  could be mutating the resolver's cached map.

## For other specialists

- **AuthZ / Public-surface auditor:** `PublicTenantsController`
  (`services/api/src/modules/tenants/public-tenants.controller.ts:14-32`) is
  `@Public()` with **no** `PublicRateLimitGuard`, and takes four unvalidated raw
  `@Query` strings with no DTO. `AGENTS.md` requires rate limiting and strict
  input validation on public endpoints. `PublicLegalController:33` and
  `PublicBillingController:91` both apply the guard; this one does not. It is the
  amplifier for CACHE-01 and CACHE-02 but it is a finding in its own right.
- **AuthZ auditor:** `AuthService.resolveLoginTenant`
  (`auth.service.ts:1543-1603`) accepts `slug`, `tenantCode`, `domain` and `host`
  from the login body simultaneously and never checks that they agree. Even with
  the cache removed, `{tenantSlug: 'a', host: 'b.example'}` silently resolves to
  tenant B while every log line reports slug `a`.
- **Tenant-isolation auditor:** `AuthAccessService.loadAccessContext`
  (`auth-access.service.ts:72-73`) uses `prisma.user.findUnique({where: {id: userId}})`
  — a bare-id lookup on a tenant-owned model. It is *safe*, because `:143-146`
  re-verifies `user.tenantId !== expectedTenantId` and throws. Worth confirming
  the check is covered by a spec, since the pattern is the one `AGENTS.md`
  forbids.
- **Observability auditor:** a failed login against a mis-resolved tenant writes
  the attempted email, IP and user-agent into that tenant's readable `AuditLog`
  (`auth.service.ts:1311-1320` → `:1756-1764` → `audit.controller.ts:19-26`).
  Independent of CACHE-01, this means any tenant admin can enumerate which email
  addresses have been *attempted* against their workspace — which is intended —
  but the same row is written before the user is known to exist, so it is also a
  channel for anyone who can influence tenant resolution.
- **Performance auditor:** `AuthAccessService.resolveBusinessUnitAccess`
  (`auth-access.service.ts:337-343`) loads every business unit of the tenant on
  every authenticated request, unbounded and unpaginated.
- **Config auditor:** `PUBLIC_TENANT_RESOLVE_CACHE_TTL_SECONDS`
  (`public-tenant-cache.service.ts:46`) is read at runtime and registered in none
  of the four places `AGENTS.md` requires.
