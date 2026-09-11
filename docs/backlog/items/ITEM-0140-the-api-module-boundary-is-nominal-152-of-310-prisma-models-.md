---
ID: ITEM-0140
aliases: [ITEM-0140]
Title: The API module boundary is nominal: 152 of 310 Prisma models are queried directly from more than one module
Type: ARCHITECTURE
Status: DEFERRED
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api/src/modules]
Source: REVIEWER
OwnerAgent: architect
ArchitectDisposition: DEFER
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0140 — The API module boundary is nominal: 152 of 310 Prisma models are queried directly from more than one module

> **Architect triage, 2026-09-11 — `DEFER`.** Real and recorded, below the line for this cycle. Revisit at the next backlog review — the evidence is in the record, so nothing is lost by scheduling it later.

## Summary

The API module boundary is nominal: 152 of 310 Prisma models are queried directly from more than one module

Identified by the 2026-09-10 full technical audit as ARCH-08 (confidence: ARCH-08=CONFIRMED).

## Why It Matters

This is the amplifier behind the audit's central premise. Tenant isolation is enforced by hand at 3,498 call sites instead of at ~21 repositories; a soft-delete, access-scope or audit rule added to an owning repository is silently not applied by the other 35 modules reading the same table; and any change to a "private" model's semantics has an unbounded blast radius.

## Evidence

**ARCH-08** (services/api/src/modules/**):

Measured by scanning every non-spec `.ts` under `services/api/src/modules` for `prisma.<model>.<operation>`:
```
DISTINCT PRISMA MODELS ACCESSED FROM modules/: 310
MODELS ACCESSED FROM >1 MODULE:                152   (49%)
TOTAL PRISMA CALL SITES:                     3,498
```
The worst offenders, with per-module call-site counts:
```
employee : 36 modules  [dashboard:22, employees:20, attendance-integrations:13,
                        attendance-engine:10, onboarding:9, organization:6, payroll:6, …]
user     : 26 modules  [tenant-control-plane:15, users:15, super-admin:12, auth:6, …]
tenant   : 20 modules  [super-admin:25, tenants:12, tenant-control-plane:11, billing:10, …]
businessUnit : 19 · department : 16 · organization : 14 · leaveRequest : 14 · attendanceEntry : 12
```
`dashboard` touches the `employee` table **more times than the `employees` module does** (22 vs 20) while importing nothing from it — `services/api/src/modules/dashboard/dashboard.module.ts:15`:
```ts
imports: [JwtModule.register({}), AttendanceModule],
```
and `dashboard.service.ts:261-281` runs `employee.count` / `employee.groupBy` on its own.

Alongside that, **37 cross-module imports of another module's repository** — the explicit thing `AGENTS.md` forbids ("Cross-module needs are satisfied by injecting the owning module's service, not by re-querying its tables"). 30 are in services, 7 in `*.module.ts` provider lists:
```
employees/employees.service.ts:36,38,39  → organization/, roles/, users/ repositories
leave/leave.service.ts:36,37             → employees/, users/ repositories
onboarding/onboarding.service.ts:14,15,17→ organization/, recruitment/, users/ repositories
payroll/payroll.service.ts:21            → employees/employees.repository
timesheets/timesheets.service.ts:20      → employees/employees.repository
tenants/tenants.service.ts:26,28,29      → super-admin/plans.repository, roles/, users/
super-admin/*.service.ts (×7)            → leads/, roles/, tenants/, users/ repositories
teams, projects, attendance, attendance-engine, auth, users, workflows, tenant-control-plane (1–2 each)
```

The concrete consequence is duplicated business rules. `Employee` is soft-deleted, and the rule is re-implemented per module rather than owned once:
`employees/employees.repository.ts:243` — `{ id: employeeId, tenantId, isDeleted: false, deletedAt: null }`
`dashboard/dashboard.service.ts:2260-2269` — a *second* copy of the same rule:
```ts
private employeeBaseWhere(currentUser, where = {}) {
  return { tenantId: currentUser.tenantId, isDeleted: false, deletedAt: null, ...where };
}
```
Eleven files query `prisma.employee` and never mention `isDeleted` at all — `lookups.service.ts` (5 queries), `loans.service.ts` (5), `payslips.service.ts` (3), `payroll/payroll-run.service.ts` (3), `notifications.service.ts` (3), `agent/agent.service.ts` (3), `attendance-integrations/mapping/employee-mapping.service.ts` (3), `claims.service.ts` (2), `business-trips.service.ts` (2), `workflows/workflow-runtime.service.ts` (2), `attendance-integrations/work-sites/employee-work-site-resolver.service.ts` (2).

---


Full finding text: ARCH-08 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/ARCH.md`.

## Proposed Approach

Not a rewrite. Three bounded steps: (1) a `scripts/check-module-boundaries.mjs` invariant that fails on a new cross-module `*.repository` import, with the existing 37 as a dated, shrinking allowlist; (2) for the three hottest tables (`employee`, `user`, `tenant`), route foreign reads through the owning repository — `EmployeesRepository` already exposes tenant-scoped finders like `findByUserIdAndTenant`; (3) audit the eleven files above for soft-delete correctness (some are legitimately meant to see deleted rows; each should say so).

(Difficulty: HIGH; Regression risk: MEDIUM; Fix now: NO — but step (1) is cheap and stops the growth.)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/** (audit id ARCH-08).

## Dependencies

None identified beyond the work itself.

## Related Items

- Audit finding `ARCH-08` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/ARCH.md`

## History

- 2026-09-10 — created at `4c86a29b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
