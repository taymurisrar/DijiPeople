---
ID: ADR-0030
aliases: [ADR-0030]
Title: Work profile and work identity contracts
Status: PROPOSED
CreatedAt: 2026-11-24
UpdatedAt: 2026-11-24
---
# ADR-0030 - Work profile and work identity contracts

## Status

Proposed - 2026-11-24. Delivers DP-MASTER slices WP-35.S0 and WP-02.S0 (design
only; no schema or code in this change). Becomes ACCEPTED when the WP-35.S1 /
WP-02.S1 ExecPlan that implements it is approved. Master plan:
`docs/programs/dp-master/MASTER-PLAN.md` (U01-U03, D02, D08).

## Context

FACT: there is no work-item, work-profile or unit model. The only work-shaped
records are `Project`, `ProjectAssignment` and `OnboardingTask`
(`services/api/prisma/schema.prisma`). Projects cannot carry non-project work
(clinic duties, BPO transactions, factory output), and forcing it in would make
every routine call or checkout a task.

The plan requires configurable work types and units (U01, U03), one shared
identity with typed domain ownership (U02), and historical records that never
recalculate when a definition changes.

## Decision

### 1. Work profile contract (WP-35)

- `WorkProfile` - tenant-owned, stable lowercase `key` (`[a-z0-9._-]{2,64}`,
  `@@unique([tenantId, key])`). The key, never the row id, is what packages,
  workflows and reports reference.
- `WorkProfileVersion` - immutable once published. Carries the definition:
  work types, units, standard effort, complexity bands, measurement mode,
  quality/verification rules. `effectiveFrom` / `effectiveTo`, no overlap per
  profile (service check inside a transaction).
- `WorkUnit` - `key`, `kind` (`DURATION | COUNT | DUTY_COMPLETION | CURRENCY`),
  base unit. Conversion between units is explicit and optional; incompatible
  units are rejected, never silently converted (M04).
- `WorkType` - `key`, `kind` in the seven approved types
  (`TASK | TRANSACTION | DUTY | OUTPUT | SERVICE | EVENT | CONTRIBUTION`),
  unit, optional standard effort per unit, effective-dated.
- `EmployeeWorkProfileAssignment` - employee, profile key, `effectiveFrom/To`;
  an employee may hold several. Eligibility by role/team/site reuses the
  existing placement scope chain; it does not introduce a second one.
- Every record produced under a profile stores the `WorkProfileVersion` id it
  was created under. Editing a default creates a new version and never rewrites
  history.

### 2. Work identity contract (WP-02)

- Typed domain records keep their own tables and lifecycle. A thin `WorkItem`
  exists only for the kinds that have a lifecycle of their own (task, service
  job, duty occurrence). Transactions, outputs, events and contributions are
  quantity/evidence entries in the WP-30 ledger and point at a work reference;
  they are never one task per checkout.
- Common reference: `(tenantId, workType, workId)` is all another module needs
  to link evidence, comments or attachments. No cross-domain blanket writes.
- `projectId` is optional on `WorkItem`. Department, site, station, customer
  and campaign are optional context fields, not required parents.
- Ownership vs effort: one accountable `ownerEmployeeId`; contributors are
  `WorkItemContributor` rows each with their own estimate and actual. Totals sum
  contributors and never double count shared work.
- Dependencies: `WorkItemDependency` edges, cycle check in the service inside the
  write transaction. Archive, never delete, items that have evidence or time.
- Lifecycle: an explicit transition table in code (not free-form status writes);
  every transition audited with before/after snapshots.

### 3. Cross-cutting rules

- Tenant isolation: every query filters `tenantId` from `request.user`; no
  `findUnique` by bare id (AGENTS.md Tenant Isolation).
- Permissions: new entity key and legacy keys registered in both systems
  (`rbac-matrix.ts`, `permissions.ts`), mirrored in `apps/web/lib/security-keys.ts`.
  Single-writer files; schema lease required.
- Entitlement: a new feature key is NOT wired to a plan by this ADR. Plan
  mapping is a commercial decision (D04) and is raised separately before any
  release; until then the module is disabled by default so no existing right
  changes.
- Portability (L01/L02): `workProfile`, `workType`, `workUnit` become portable
  `.djpkg` component families keyed by logical key, not row id.
- Not a clinical, manufacturing or inventory record: no patient or customer
  identifiers are stored; aggregate counts only (U04).

## Alternatives rejected

- One universal work table with a JSON payload: loses typing, indexing and
  per-domain rules, and makes tenant scoping and reporting hard to verify.
- Tasks for every transaction: volume and noise; contradicts U03.
- Per-industry models: contradicts D02 (universal foundation, templates later).

## Consequences

- WP-02, WP-06, WP-09, WP-36 and WP-30 can build against stable keys and a
  single reference shape before their own schemas land.
- Schema work (WP-35.S1, WP-02.S1) is single-writer and needs the `schema` lease.
- Open: unit conversion table scope and the entitlement mapping above.

## References

- `docs/programs/dp-master/program-state.json` slices WP-35.S0, WP-02.S0
- Master plan sections 5 (WP-35, WP-02) and 6.1 (U01-U06)
