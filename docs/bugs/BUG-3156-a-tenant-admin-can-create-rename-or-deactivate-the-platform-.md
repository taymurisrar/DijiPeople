---
ID: BUG-3156
aliases: [BUG-3156]
Title: A tenant admin can create, rename or deactivate the platform-wide shared geography reference data
Status: OPEN
Severity: HIGH
Priority: P1
Type: TENANT_ISOLATION
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/lookups]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3156 — A tenant admin can create, rename or deactivate the platform-wide shared geography reference data

> **Architect triage, 2026-09-11 — `FIX_NOW`.** A tenant admin mutating platform-wide shared reference data reaches outside their tenant. Integrity rather than disclosure, and the isolation invariant is the product's single most important one.

## Summary

A tenant admin can create, rename or deactivate the platform-wide shared geography reference data

Identified by the 2026-09-10 full technical audit as TEN-02 / ARCH-02 (confidence: TEN-02=CONFIRMED, ARCH-02=CONFIRMED).

## Expected Behavior

**TEN-02:** Mutating shared, non-tenant-owned reference data should require a platform permission (e.g. assertPlatformAdministrator / assertTenantPlatformAccess-style gate, as tenant-control-plane and contracts do for their platform-only mutations), not a tenant-scoped permission. If tenant-level curation of the location list is actually intended product behaviour, it needs tenant-scoped data (a tenantId on these models, or a tenant-specific override/exclusion table) rather than a shared table with tenant-gated writes.

**ARCH-02:** Global reference data is platform-owned. These mutations belong behind `PlatformPermissionsGuard` on a `super-admin` / `platform-*` route, exactly as `AGENTS.md` states: "Cross-tenant … are only legitimate on the **platform** path (`authSubjectType: 'platform-user'`) … Never widen a tenant endpoint to serve platform needs."

## Actual Behavior

**TEN-02:** The permission gating these mutation endpoints (settings.update, TENANT_ADMINISTRATION.write) is an ordinary tenant-scoped permission that any tenant's System/HR Administrator role can hold within their own tenant. There is no user.platform check anywhere in lookups.controller.ts or lookups.service.ts for these handlers (compare with modules/contracts/contracts.service.ts or modules/tenant-control-plane/tenant-control-plane.guard.ts's assertTenantPlatformAccess, which this file has no equivalent of). Because StateProvince/City are genuinely shared singletons, a write from any one tenant's admin is visible to and affects every other tenant on the platform immediately — renaming, deactivating, or (if the block condition in deleteState/deleteCity happens to read zero cross-tenant usage — itself the TEN-01 count) deleting a location every other tenant's employee records, address forms and dropdowns depend on.

**ARCH-02:** A user of tenant A holding `settings.update` plus `SETTINGS:configure` (the tenant System Admin holds both; HR holds the legacy key) can rename, create or deactivate a `StateProvince` / `City` row that every other tenant's employee records and address pickers use. Deactivation removes the row from every tenant's lists at once.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior. Multiple audit findings are consolidated into this record; each is independently traceable at its own citation.

## Evidence

**TEN-02** (services/api/src/modules/lookups/lookups.controller.ts, services/api/src/modules/lookups/lookups.service.ts):

services/api/src/modules/lookups/lookups.controller.ts:66-72 —
```
@Post('states')
@Permissions('settings.update')
@RequireAnyPermission(
  { entityKey: ENTITY_KEYS.SETTINGS, action: 'configure' },
  { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'write' },
)
createState(@Body() body: Record<string, unknown>) { ... }
```
Same shape (settings.update + SETTINGS.configure/TENANT_ADMINISTRATION.write, no platform gate) for PATCH states/:id (line 96), DELETE states/:id (line 106), POST cities (line 127), PATCH cities/:id (line 157), DELETE cities/:id (line 167). services/api/src/modules/lookups/lookups.service.ts:227-238 (deleteState) —
```
const [cityCount, employeeCount] = await Promise.all([
  this.prisma.city.count({ where: { stateProvinceId: id } }),
  this.prisma.employee.count({ where: { stateProvinceId: id } }),
]);
if (cityCount || employeeCount) { throw new ConflictException(...); }
await this.prisma.stateProvince.update({ where: { id }, data: { isActive: false } });
```
Country/StateProvince/City have no tenantId column — they are the single global copy every tenant's UI reads from (schema.prisma:3864-3913).

---

**ARCH-02** (services/api/src/modules/lookups, apps/web/app/api/lookups/**):

`services/api/prisma/schema.prisma:3864-3878` — `Country` has **no `tenantId`**:
```prisma
model Country {
  id        String          @id @default(uuid())
  code      String          @unique
  name      String
```
`StateProvince` (line 3880) and `City` are the same shape — global reference data.

`services/api/src/modules/lookups/lookups.controller.ts:24-25` — the controller is on the **tenant** auth path, not the platform one:
```ts
@Controller('lookups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
```

`services/api/src/modules/lookups/lookups.controller.ts:96-114` — a tenant permission gates a global mutation:
```ts
@Patch('states/:id')
@Permissions('settings.update')
@RequireAnyPermission(
  { entityKey: ENTITY_KEYS.SETTINGS, action: 'configure' },
  { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'write' },
)
updateState(@Param('id') id: string, @Body() body: Record<string, unknown>) {
```
The same pair guards `@Post('states')` (line 66), `@Delete('states/:id')` (106), `@Post('cities')` (127), `@Patch('cities/:id')` (157), `@Delete('cities/:id')` (167).

`services/api/src/common/constants/permissions.ts:348-352` — `settings.update` is documented as a **tenant** permission:
```ts
key: 'settings.update',
name: 'Update settings',
description: 'Update tenant configuration values and enabled feature flags.',
```
and `permissions.ts:2186` grants the tenant `system-admin` role every non-customization key (`'system-admin': NON_CUSTOMIZATION_PERMISSION_KEYS`); `permissions.ts:2223` grants `'settings.update'` to the tenant **HR** role as well.

`services/api/src/modules/lookups/lookups.service.ts:151-158` — no tenant scope, no platform check:
```ts
async updateState(id: string, body: Record<string, unknown>) {
  const existing = await this.prisma.stateProvince.findFirst({ where: { id } });
  if (!existing) throw new NotFoundException('State / Province was not found.');
  const data = await this.readStateData(body, existing);
  return this.prisma.stateProvince.update({ where: { id }, data });
}
```
`lookups.service.ts:176-179` deletes the same way (`stateProvince.update({ where: { id }, data: { isActive: false } })`), and `lookups.service.ts:235` does it for `City`.

Reachable end to end from the tenant product: `apps/web/app/api/lookups/states/[id]/route.ts:14-22` proxies `PATCH`, and `:24-31` proxies `DELETE`, to `/lookups/states/${id}`.

---


Full finding text: TEN-02 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/TEN.md`; ARCH-02 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/ARCH.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

**TEN-02:** Any tenant's System Administrator (an ordinary, non-platform, commonly-granted role) can silently corrupt or remove geography data relied on by every other tenant — e.g. DELETE /api/lookups/states/:id on a state with zero employees platform-wide today succeeds permanently for everyone, or PATCH /api/lookups/cities/:id renaming a city changes what every other tenant's employee address, onboarding and payroll forms display. This is a cross-tenant integrity/availability break, not merely a read leak.

**ARCH-02:** One tenant's HR or admin user silently corrupts reference data for all other tenants — a renamed or deactivated city breaks address selection and employee address display across the whole platform, with no cross-tenant audit trail and nothing in the UI warning the actor that the row is not theirs. It is also a denial-of-service primitive: deactivate the states a competitor tenant's workforce lives in.

## Affected Areas

services/api/src/modules/lookups

## Proposed Resolution

**TEN-02:** Gate createState/updateState/deleteState/createCity/updateCity/deleteCity (and the Country equivalents if they exist outside read) behind a platform-only permission check, mirroring assertTenantPlatformAccess/assertPlatformAdministrator from tenant-control-plane.guard.ts. Fix TEN-01's count query alongside this, since the delete-block check becomes platform-legitimate once the endpoint itself is platform-gated. (Difficulty: LOW–MEDIUM (permission gate change + regression tests for the small number of tenants that may currently rely on self-service geography edits — check whether this is exercised in any tenant onboarding flow before flipping the gate); Regression risk: MEDIUM (if any tenant-facing UI currently depends on self-service create/edit of countries/states/cities, that flow needs to move to a platform-mediated request instead); Fix now: YES)

**ARCH-02:** Move `createState`/`updateState`/`deleteState`/`createCity`/`updateCity`/`deleteCity` out of `LookupsController` onto a platform-guarded controller (`SuperAdminController` or a new `PlatformGeographyController`) using `JwtAuthGuard, RolesGuard, PlatformPermissionsGuard`. Leave the `@Get` list/detail handlers on the tenant path. If tenants genuinely need to add local cities, add a tenant-owned `TenantCity` model rather than writing the global table. (Difficulty: MEDIUM; Regression risk: MEDIUM — the tenant settings screens under `/settings/regional/geography/*` currently call these and will need to move or lose their write controls.; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/lookups/lookups.controller.ts, services/api/src/modules/lookups/lookups.service.ts (audit id TEN-02).
- The behaviour described in Expected Behavior holds for services/api/src/modules/lookups, apps/web/app/api/lookups/** (audit id ARCH-02).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: TEN-02=MEDIUM (if any tenant-facing UI currently depends on self-service create/edit of countries/states/cities, that flow needs to move to a platform-mediated request instead), ARCH-02=MEDIUM — the tenant settings screens under `/settings/regional/geography/*` currently call these and will need to move or lose their write controls.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `TEN-02` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/TEN.md`
- Audit finding `ARCH-02` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/ARCH.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (TEN-02, ARCH-02) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
