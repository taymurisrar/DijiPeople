---
ID: BUG-3162
aliases: [BUG-3162]
Title: Public tenant-resolve cache is keyed on caller-supplied selectors instead of the resolved tenant (downgraded from CRITICAL to HIGH on reconciliation)
Status: OPEN
Severity: HIGH
Priority: P1
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/tenants]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt:
---

# BUG-3162 — Public tenant-resolve cache is keyed on caller-supplied selectors instead of the resolved tenant (downgraded from CRITICAL to HIGH on reconciliation)

## Summary

Public tenant-resolve cache is keyed on caller-supplied selectors instead of the resolved tenant (downgraded from CRITICAL to HIGH on reconciliation)

Identified by the 2026-09-10 full technical audit as CACHE-01 (confidence: CACHE-01=CONFIRMED).

## Expected Behavior

The cache key must be derived from the tenant that was actually resolved (e.g. `tenant:resolve:id:<resolvedTenantId>` plus alias keys written only for the discriminators that actually produced the match), or the two precedence orders must be identical and a request carrying conflicting discriminators must be refused with a 400.

## Actual Behavior

`GET /api/public/tenants/resolve?slug=victimco&host=attackerco.<base-domain>` builds the key `tenant:resolve:slug:victimco`, resolves the tenant by `attackerco.<base-domain>` (because `host` wins in the resolver), and stores the **attacker's** tenant under the **victim's** slug key for 300 seconds. For the next 300 s, every caller asking for `slug=victimco` — including `AuthService.resolveLoginTenant` — is told that slug belongs to the attacker's tenant id.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**CACHE-01** (`services/api/src/modules/tenants/public-tenants.service.ts`, `public-tenant-cache.service.ts`, consumed by `modules/auth/auth.service.ts`):

The cache key prefers `domain` → `slug` → `host` → `tenantCode`:

`services/api/src/modules/tenants/public-tenants.service.ts:282-288`
```ts
private buildCacheKey(input: ResolveInput) {
  if (input.domain) return `tenant:resolve:domain:${input.domain}`;
  if (input.slug) return `tenant:resolve:slug:${input.slug}`;
  if (input.host) return `tenant:resolve:host:${input.host}`;
```

The **resolution** prefers `domain ?? host` → `slug` → `tenantCode` — a different order, and `host` outranks `slug` here while `slug` outranks `host` above:

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

The endpoint is unauthenticated and carries **no rate-limit guard** (contrast `public-legal.controller.ts:33`, which does):

`services/api/src/modules/tenants/public-tenants.controller.ts:18-31`
```ts
@Public()
@Get('resolve')
resolve(@Query('slug') slug?, @Query('domain') domain?, @Query('host') host?, ...)
```

Every provisioned tenant has a `TenantDomain` row for its workspace hostname, so the `host` an attacker supplies only has to be *some* tenant's hostname:

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

And a miss writes the victim's email, IP and user-agent into the **attacker's** tenant audit log:

`services/api/src/modules/auth/auth.service.ts:1311-1317`
```ts
await this.logTenantAuthEvent({
  tenantId: tenantContext.id,
  entityId: normalizedEmail,
  email: normalizedEmail,
  failureReason: 'USER_NOT_FOUND',
```

`services/api/src/modules/auth/auth.service.ts:1756-1763` puts `email`, `ipAddress` and `userAgent` into `afterSnapshot`, and `services/api/src/modules/audit/audit.controller.ts:19-26` serves those rows to any user with `audit.read` in that tenant:
```ts
return this.auditService.listByTenant(user.tenantId, query);
```

---


Full finding text: CACHE-01 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/CACHE.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Concretely, three effects, all from one unauthenticated GET:
  1. **Total login outage for an arbitrary tenant.** Every employee of `victimco` is looked up in the attacker's tenant, is not found, and receives `AUTH_INVALID_CREDENTIALS`. Repeatable forever; the endpoint has no rate limit.
  2. **Cross-tenant disclosure.** Each failed attempt writes the victim employee's email address, IP address and user-agent into the attacker's `AuditLog`, readable in the attacker's own admin UI. This is a working harvester for the victim tenant's user directory and sign-in times.
  3. **Login-page misdirection.** `apps/web/app/(public)/login/company-code-login-step.tsx:36-45` resolves a typed company code by `slug` and then `window.location.assign(buildTenantLoginUrl(data.tenant.slug))` — sending the user to the attacker's workspace login page under the attacker's branding.

## Affected Areas

services/api/src/modules/tenants

## Proposed Resolution

In `PublicTenantsService.resolve`, compute the cache key *after* resolution from the resolved tenant, and index aliases explicitly: `tenant:resolve:slug:<tenant.slug>`, `tenant:resolve:code:<tenant.tenantCode>`, `tenant:resolve:domain:<matched domain>`. Reject a request that supplies more than one discriminator, or make `buildCacheKey`'s precedence identical to `findTenantForPublicResolution`'s. Add `PublicRateLimitGuard` to `PublicTenantsController`. Add a spec asserting that `resolve({slug: A, host: B})` never stores tenant B under a key naming A.

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/tenants/public-tenants.service.ts`, `public-tenant-cache.service.ts`, consumed by `modules/auth/auth.service.ts` (audit id CACHE-01).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: CACHE-01=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `CACHE-01` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/CACHE.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (CACHE-01) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-control-plane]]

<!-- GRAPH:END -->
