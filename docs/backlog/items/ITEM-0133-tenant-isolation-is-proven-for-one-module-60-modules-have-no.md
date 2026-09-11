---
ID: ITEM-0133
aliases: [ITEM-0133]
Title: Tenant isolation is proven for one module; 60+ modules have no isolation test
Type: TEST_GAP
Status: READY
Priority: P2
Severity: HIGH
AffectedModules: [services/api/test]
Source: REVIEWER
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0133 — Tenant isolation is proven for one module; 60+ modules have no isolation test

> **Premise needs re-measurement before scheduling, 2026-09-11.** The title says
> isolation is proven for one module. `services/api/test/` now holds four
> isolation suites. That does not make the record false — sixty-plus modules is
> still the denominator — but the numerator has moved and nobody re-counted.
> Measure before planning: three sibling records in this session turned out to be
> describing work that was already done ([[ITEM-0115]], [[ITEM-0129]],
> [[ITEM-0135]]).

> **Architect triage, 2026-09-11 — `PLAN_REQUIRED`.** Isolation proven for one module of sixty-plus. The single most important invariant in this codebase is enforced by convention; a generated per-module suite is the only way to cover it, and that is a design task.

## Summary

Tenant isolation is proven for one module; 60+ modules have no isolation test

Identified by the 2026-09-10 full technical audit as CI-04 (confidence: CI-04=CONFIRMED).

## Why It Matters

a service written without `tenantId` in its `where` ships green.
  Nothing in CI would notice. Given no RLS and no working Prisma middleware
  (`$use` is inert on `@prisma/client@7.8.0`), CI is the only remaining net and it
  has one square of mesh.

## Evidence

**CI-04** (`services/api/test/`):

The briefing named two specs. Read end to end, they are not what their filenames
  suggest to a reader scanning the directory:

  - **`test/attendance-integrations-isolation.e2e-spec.ts` (991 lines) is
    excellent and genuinely proves isolation** — for one module. It drives the
    *real* services against a *real* PostgreSQL and runs the ID-guessing attack:
    ```
    :30-33  The central case is ID GUESSING: tenant A holds a genuine, currently-valid id
            belonging to tenant B and calls each service with it. Every one must behave as
            though the record does not exist.
    ```
    34 such tests: `it('rejects reading another tenant's integration')`,
    `it('rejects rotating a credential on another tenant's gateway')`,
    `it('rejects a cross-tenant mapping at the service layer too')` (`:416`, `:615`, `:548`).
    Scope: `attendance-integrations` + the attendance-engine queue. Nothing else.

  - **`test/permission-propagation.e2e-spec.ts` is not an isolation test at all.**
    It tests `PermissionBootstrapService.bootstrapTenantRbac` seeding —
    `it('adds every missing foundation permission when synchronised')` (`:150`),
    `it('produces no duplicates when run repeatedly')` (`:235`). No cross-tenant
    read is attempted anywhere in its 376 lines.

  - `test/tenant-isolation-pattern.e2e-spec.ts` says of itself:
    ```
    :23-27  This suite is small on purpose. It is not an attempt to test tenant isolation
            across the product — it establishes the *pattern* that module-specific
            isolation tests copy...
    ```
    It asserts on `prisma.role` directly, so it proves PostgreSQL and Prisma
    behave, not that any service or endpoint is scoped.

  - `test/reporting-tenant-isolation.e2e-spec.ts` (302 lines) is a real
    cross-tenant test of the reporting engine's `planWhere` + `ReportScopeResolver`
    — `it('returns no row belonging to the other tenant')` (`:157`). It explicitly
    bypasses HTTP.

  Repo-wide search for any other test that constructs two tenants and attempts a
  cross-tenant access finds 23 files, **all of which are unit specs with a mocked
  Prisma** — they can assert a `where` clause was *shaped* with a `tenantId`, which
  is a weaker claim than "the database returned nothing".

  Confirmed: **no API unit spec touches a real database.**
  ```
  $ git grep -lE "new PrismaClient|PrismaPg" -- 'services/api/src/**/*.spec.ts'
  (no output)
  ```
  Of 307 API unit specs, 119 mock Prisma with `jest.fn()`, 188 test pure logic or
  scan source; exactly **1** uses `Test.createTestingModule`.

  Modules with **no** tenant-isolation test of any kind: `employees`, `payroll`,
  `payslips`, `leave`, `attendance`, `timesheets`, `documents`, `claims`, `loans`,
  `benefits`, `compensation`, `recruitment`, `onboarding`, `approvals`,
  `workflows`, `audit`, `views`, `navigation`, `data`, `inbox`, and the rest.

---


Full finding text: CI-04 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/CI.md`.

## Proposed Approach

two complementary moves. (1) Copy the
  `attendance-integrations-isolation` shape to the highest-value tenant-owned
  modules — `employees`, `payslips`, `leave`, `documents`, `attendance` first;
  the file's own header is written as a recipe for exactly this. (2) Add a static
  invariant spec in the style of `common/constants/wiring-invariants.spec.ts` that
  fails when a repository method on a tenant-owned model calls `findUnique` by bare
  id or issues a `where` with no `tenantId`, with an explicit allowlist for
  platform-guarded paths.

(Difficulty: HIGH (1), MEDIUM (2); Regression risk: LOW; Fix now: YES for (2), LATER for (1) done module by module)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/test/` (audit id CI-04).

## Dependencies

None identified beyond the work itself.

## Related Items

- Audit finding `CI-04` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/CI.md`

## History

- 2026-09-10 — created at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
