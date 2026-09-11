---
ID: BUG-3211
aliases: [BUG-3211]
Title: Roughly two dozen SQL statements run before any controller does, on every authenticated request
Status: DEFERRED
Severity: MEDIUM
Priority: P2
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 4c86a29b
AffectedModules: [services/api/src/common]
OwnerAgent: architect
ArchitectDisposition: DEFER
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3211 — Roughly two dozen SQL statements run before any controller does, on every authenticated request

> **Architect triage, 2026-09-11 — `DEFER`.** Real and recorded, below the line for this cycle. Revisit at the next backlog review — the evidence is in the record, so nothing is lost by scheduling it later.

## Summary

Roughly two dozen SQL statements run before any controller does, on every authenticated request

Identified by the 2026-09-10 full technical audit as CACHE-12 (confidence: CACHE-12=CONFIRMED (read end to end; the query *count* is derived from Prisma's relation-load strategy, which the schema does not opt out of — see below)).

## Expected Behavior

The permission grant must stay live (see Part B tier 6 — it must not be cached). The *fan-out* is what should shrink.

## Actual Behavior

~24 SQL statements before the handler runs. Multiply by CACHE-11: rendering one authenticated page is 7+ API calls, so **~170 SQL statements of pure auth overhead per page view**, against a single Render `starter` instance and a Neon database.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**CACHE-12** (`services/api/src/common/guards/jwt-auth.guard.ts`, `modules/auth/auth-access.service.ts`):

`jwt-auth.guard.ts:98-106,134` — four distinct database phases per request:
```ts
await this.assertSessionIsActive(payload, clientId);
const { authUser } = ... await this.authAccessService.loadAccessContext(payload.sub, payload.tenantId);
...
await this.assertTimesheetRestrictionAllowsRequest(request);
```

1. `refreshToken.findFirst` — `jwt-auth.guard.ts:305-317`.
2. `tenantSetting.findFirst` for the idle timeout — `jwt-auth.guard.ts:360-368` — which runs on every `web` request because sliding sessions default **on**: `common/config/auth.config.ts:235-237`
```ts
return configService.get<string>('SESSION_SLIDING_ENABLED') !== 'false';
```
This read bypasses the 30 s settings resolver entirely and goes straight to `TenantSetting` (trap 5 in `docs/knowledge/architecture/settings-and-configuration.md:216-221`).
3. `loadAccessContext` — `auth-access.service.ts:72-137` — one `user.findUnique` with **19 nested relation loads**: tenant, businessUnit→organization, employee, userPermissions→permission, userRoles→role→(rolePermissions→permission, rolePrivileges, miscPermissions), teamMemberships→team→teamRoles→role→(rolePermissions→permission, rolePrivileges, miscPermissions). The generator block declares no `relationJoins` preview feature — `services/api/prisma/schema.prisma:6-9`
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
5. `employee.findFirst` + `timesheetAccessRestriction.findFirst` — `jwt-auth.guard.ts:197-214`.

---


Full finding text: CACHE-12 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/CACHE.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

(not stated)

## Affected Areas

services/api/src/common

## Proposed Resolution

In the order that pays:
  1. Fix CACHE-11 first — it removes duplicate whole-chains, not just queries.
  2. Enable Prisma's `relationJoins` preview feature and re-measure; the 19 relation loads collapse toward one query with lateral joins. This is a schema generator change, not a caching change, and needs its own ExecPlan under `PLANS.md` because it changes every `include` in the codebase.
  3. Move the idle-timeout read (phase 2) onto `TenantSettingsResolverService`, which already caches that tenant's settings for 30 s — one line, and it deletes a per-request query outright.
  4. Cache the business-unit tree per tenant (Part B recommendation B3).

(Difficulty: MEDIUM (items 1, 3) / HIGH (item 2); Regression risk: LOW (1, 3) / MEDIUM (2); Fix now: LATER — but item 3 is a one-line YES.)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/common/guards/jwt-auth.guard.ts`, `modules/auth/auth-access.service.ts` (audit id CACHE-12).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: CACHE-12=LOW (1, 3) / MEDIUM (2). Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `CACHE-12` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/CACHE.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (CACHE-12) at `4c86a29b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
