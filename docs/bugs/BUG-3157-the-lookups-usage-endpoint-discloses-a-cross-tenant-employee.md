---
ID: BUG-3157
aliases: [BUG-3157]
Title: The lookups usage endpoint discloses a cross-tenant employee-count aggregate and lets one tenant block another tenant's delete
Status: OPEN
Severity: HIGH
Priority: P1
Type: TENANT_ISOLATION
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/lookups]
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

# BUG-3157 — The lookups usage endpoint discloses a cross-tenant employee-count aggregate and lets one tenant block another tenant's delete

## Summary

The lookups usage endpoint discloses a cross-tenant employee-count aggregate and lets one tenant block another tenant's delete

Identified by the 2026-09-10 full technical audit as TEN-01 / ARCH-03 (confidence: TEN-01=CONFIRMED, ARCH-03=CONFIRMED).

## Expected Behavior

**TEN-01:** matches the pattern used everywhere else in this codebase for an identical "can I delete this because X still references it" check — e.g. enterprise-configuration.service.ts:1125 (getFiscalYearUsage(tenantId, id) → count({ where: { tenantId, fiscalYearId: id } })) or leave.service.ts:165 (listLeaveTypeUsage(tenantId, id)), both of which thread tenantId through. lookups.service.ts is the one place in the module family that does not.

**ARCH-03:** Scope the count to `currentUser.tenantId`, or move the endpoint to the platform path together with the mutations in ARCH-02.

## Actual Behavior

**TEN-01:** @Controller('lookups') @UseGuards(JwtAuthGuard, PermissionsGuard) — an ordinary tenant-scoped controller. Any user holding settings.read + (branding.read or tenant-administration.read) — a routine tenant System Administrator permission, not a platform permission — can call GET /api/lookups/countries/:id/usage (and the state/city equivalents) and receive an Employee count filtered only by countryId/stateProvinceId/cityId, with no tenantId in the where clause at all. The count is the number of employees across every tenant on the platform that reference that location, not the caller's own tenant.

**ARCH-03:** `GET /api/lookups/states/:id/usage` returns the number of employees in that state **across every tenant on the platform**. A tenant admin can enumerate global workforce distribution by geography, one row at a time.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior. Multiple audit findings are consolidated into this record; each is independently traceable at its own citation.

## Evidence

**TEN-01** (services/api/src/modules/lookups/lookups.service.ts, services/api/src/modules/lookups/lookups.controller.ts):

services/api/src/modules/lookups/lookups.service.ts:108 — this.prisma.employee.count({ where: { countryId: country.id } })
services/api/src/modules/lookups/lookups.service.ts:145 — this.prisma.employee.count({ where: { stateProvinceId: id } })
services/api/src/modules/lookups/lookups.service.ts:211 — this.prisma.employee.count({ where: { cityId: id } })
services/api/src/modules/lookups/lookups.controller.ts:46-53 —
```
@Get('countries/:id/usage')
@Permissions('settings.read')
@RequireAnyPermission(
  { entityKey: ENTITY_KEYS.BRANDING, action: 'read' },
  { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'read' },
)
getCountryUsage(@Param('id') id: string) { ... }
```
(same shape at states/:id/usage line 86 and cities/:id/usage line 147). Employee is confirmed tenant-owned (tenantId String in services/api/prisma/schema.prisma). Country/StateProvince/City themselves are legitimately global/shared reference tables (no tenantId field, schema.prisma:3864-3913) — that part is fine by design.

---

**ARCH-03** (services/api/src/modules/lookups/lookups.service.ts):

`services/api/src/modules/lookups/lookups.service.ts:143-146` — `Employee` is a tenant-owned model, and this count has no `tenantId`:
```ts
await usage(
  'Employee',
  this.prisma.employee.count({ where: { stateProvinceId: id } }),
),
```
Same shape at `:108` (`countryId`), `:169`, `:211` and `:227-229` (`cityId`).
Reachable from the tenant path at `lookups.controller.ts:46-53` (`@Get('countries/:id/usage')`, `@Permissions('settings.read')`).
`lookups.service.ts:167-175` turns the cross-tenant count into a functional dependency:
```ts
if (cityCount || employeeCount) {
  throw new ConflictException(
    'State / Province cannot be deleted because cities or employees reference it.',
  );
}
```

---


Full finding text: TEN-01 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/TEN.md`; ARCH-03 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/ARCH.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

**TEN-01:** A tenant's own System Administrator (not a platform user) learns how many employees other tenants have in a given country/state/city by probing /lookups/*/usage across ids — a direct cross-tenant data disclosure reachable by a large, ordinary role, no platform access required. Repeated probing across every seeded country/state/city can build a coarse cross-tenant headcount-by-geography profile of the whole platform.

**ARCH-03:** Aggregate cross-tenant disclosure (not record-level). A tenant can infer where other DijiPeople customers employ people and roughly how many, which is commercially sensitive and is a tenant-isolation break by the repository's own rule ("Every query against a tenant-owned model **must** filter on `tenantId`").

## Affected Areas

services/api/src/modules/lookups

## Proposed Resolution

**TEN-01:** Add tenantId to all Employee.count() calls inside getCountryUsage, getStateUsage, getCityUsage, deleteState, and deleteCity in lookups.service.ts, taking tenantId from AuthenticatedUser (thread it through the controller methods, which currently only pass id/body). If the intent is genuinely to block deletion of a shared reference row while any tenant uses it (see TEN-02), that platform-wide check belongs behind a platform permission, not exposed to a tenant-scoped /usage endpoint — split the two concerns. (Difficulty: LOW; Regression risk: LOW; Fix now: YES)

**ARCH-03:** Add `tenantId: currentUser.tenantId` to every `prisma.employee.count` in `lookups.service.ts` and thread `@CurrentUser()` into `getCountryUsage`, `getStateUsage`, `getCityUsage`, `deleteState`, `deleteCity` — or relocate them per ARCH-02. (Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/lookups/lookups.service.ts, services/api/src/modules/lookups/lookups.controller.ts (audit id TEN-01).
- The behaviour described in Expected Behavior holds for services/api/src/modules/lookups/lookups.service.ts (audit id ARCH-03).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: TEN-01=LOW, ARCH-03=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `TEN-01` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/TEN.md`
- Audit finding `ARCH-03` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/ARCH.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (TEN-01, ARCH-03) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
