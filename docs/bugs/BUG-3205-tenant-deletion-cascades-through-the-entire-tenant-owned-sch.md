---
ID: BUG-3205
aliases: [BUG-3205]
Title: Tenant deletion cascades through the entire tenant-owned schema, including every audit and payroll table, with no database-level barrier
Status: OPEN
Severity: HIGH
Priority: P1
Type: DATABASE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 4c86a29b
AffectedModules: [services/api/prisma]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3205 — Tenant deletion cascades through the entire tenant-owned schema, including every audit and payroll table, with no database-level barrier

> **Architect triage, 2026-09-11 — `PLAN_REQUIRED`.** Tenant deletion cascading through the whole schema is correct until it is catastrophic. Needs a design with a soft-delete window and a tested restore, which depends on ITEM-0131.

## Summary

Tenant deletion cascades through the entire tenant-owned schema, including every audit and payroll table, with no database-level barrier

Identified by the 2026-09-10 full technical audit as SCHEMA-01 (confidence: SCHEMA-01=LIKELY (schema cascade is CONFIRMED; the "no other caller"
  claim is LIKELY — verified for the current codebase, not provable for all
  future code)).

## Expected Behavior

The schema should not be capable of silently destroying `AuditLog`/`Payslip`/`PayrollRecord`/payroll history via a bare `Tenant` delete. A common pattern is `onDelete: Restrict` on the highest-value historical tables (forcing any deletion path — including the erasure service — to explicitly archive or export them first), or an application-level guard (e.g. a Prisma extension or `$transaction` wrapper) that refuses `tenant.delete()` outside the erasure service.

## Actual Behavior

The erasure service deletes child rows in an explicit, carefully ordered sequence (`TENANT_ERASURE_LINK_CLEANUPS`, `TENANT_ERASURE_SELF_REFERENCES`, `TENANT_ERASURE_DELETE_ORDER`) *before* calling `tenant.delete()`, so today's only caller behaves correctly. But the database's own `onDelete: Cascade` graph is independently sufficient to do the same destruction with none of that care — any future direct `prisma.tenant.delete()` call (a test-cleanup script, an admin REPL one-liner, a future engineer unaware of the erasure service) instantly and irrecoverably destroys every audit log, payslip, and payroll record for that tenant, with no confirmation step and no archival requirement enforced by the schema itself.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**SCHEMA-01** (`services/api/prisma/schema.prisma` (schema-wide), `services/api/src/modules/tenant-control-plane/tenant-erasure.service.ts`):

  `schema.prisma` — 237 models declare `tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)`; BFS closure over all `onDelete: Cascade` edges from `Tenant` reaches 246 of 325 models in 2 hops, including `AuditLog`, `Payslip`, `PayrollRecord`, `PayrollRun`, `EmployeeCompensationHistory`.
  `services/api/src/modules/tenant-control-plane/tenant-erasure.service.ts:555` — `await tx.tenant.delete({ where: { id: tenantId } });` is the only call to `tenant.delete`/`tenant.deleteMany` found anywhere in `services/api/src` (`grep -rln "tenant\.delete("` → 3 files total, the other 2 are `demo-data` and `tenant-erasure.constants.ts` which only reference the constant, not call delete).

---


Full finding text: SCHEMA-01 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/SCHEMA.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

A future direct-delete call (test harness, ops script, accidental REPL command) against a tenant with real financial/audit history is an unrecoverable data-loss and compliance event — no backup-before-delete step is enforced by the schema.

## Affected Areas

services/api/prisma

## Proposed Resolution

Consider `onDelete: Restrict` (not `Cascade`) from `Tenant` to at minimum `AuditLog`, `PayrollRecord`, `Payslip`, `PayrollRun`, and require the erasure service to explicitly export/archive and then `deleteMany` those specific tables before the final `tenant.delete()` — which it already does for other tables, so this would only formalize what one path already does correctly and forbid every other path from bypassing it.

(Difficulty: MEDIUM (schema change + migration + erasure-service already does the right ordering, so mostly a `Restrict` flip plus verifying no other path relies on cascading through these tables); Regression risk: MEDIUM (must verify no other legitimate flow relies on cascading these specific tables via a bare tenant delete); Fix now: LATER (no currently-reachable caller violates this; worth a deliberate ExecPlan rather than an ad-hoc change, per `PLANS.md`'s rules on destructive-change review))

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/prisma/schema.prisma` (schema-wide), `services/api/src/modules/tenant-control-plane/tenant-erasure.service.ts` (audit id SCHEMA-01).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: SCHEMA-01=MEDIUM (must verify no other legitimate flow relies on cascading these specific tables via a bare tenant delete). Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `SCHEMA-01` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/SCHEMA.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (SCHEMA-01) at `4c86a29b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[database-architecture]]

<!-- GRAPH:END -->
