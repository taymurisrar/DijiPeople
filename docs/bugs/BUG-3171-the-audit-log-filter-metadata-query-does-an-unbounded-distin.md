---
ID: BUG-3171
aliases: [BUG-3171]
Title: The Audit Log filter-metadata query does an unbounded DISTINCT scan over the tenant's entire audit history on every page load
Status: OPEN
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/audit]
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

# BUG-3171 — The Audit Log filter-metadata query does an unbounded DISTINCT scan over the tenant's entire audit history on every page load

> **Architect triage, 2026-09-11 — `FIX_NOW`.** An unbounded DISTINCT scan for filter metadata is fixable with an index and a bounded query, without redesigning anything.

## Summary

The Audit Log filter-metadata query does an unbounded DISTINCT scan over the tenant's entire audit history on every page load

Identified by the 2026-09-10 full technical audit as DBQ-06 (confidence: DBQ-06=CONFIRMED).

## Expected Behavior

Cache the filter metadata (it changes only when a new
  action/entity type is introduced in code, or a new user's first audit row is
  written — both rare, cacheable at the tenant level with a long TTL or
  invalidated on write), or derive it from a small, maintained lookup table
  instead of scanning the fact table.

## Actual Behavior

Every load of, and every filter change on, the Audit
  Log screen re-scans the tenant's entire `AuditLog` history twice (once for
  distinct actions, once for distinct entity types) plus a `user.findMany`
  with an `EXISTS`-style subquery for "any user with at least one audit row".
  `AuditLog` is explicitly the codebase's mandated write target for "every
  state-changing operation" (AGENTS.md, `AuditService.log()`), so it is one of
  the fastest-growing tables in the schema and has no retention/archival
  policy visible in this sweep (see "Not examined").

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**DBQ-06** (`services/api/src/modules/audit/audit.repository.ts`,
  `audit.service.ts`):

`audit.service.ts:109-113` (`listByTenant`, the handler behind `GET /audit`):
  ```ts
  const [{ items, total }, metadata] = await Promise.all([
    this.auditRepository.findByTenant(tenantId, query),
    this.auditRepository.getFilterMetadata(tenantId),
  ]);
  ```
  `audit.repository.ts:114-134` (`getFilterMetadata`, run on **every** call to
  the list endpoint, not cached):
  ```ts
  const [actions, entityTypes, actors] = await Promise.all([
    db.auditLog.findMany({
      where: { tenantId }, distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' },
    }),
    db.auditLog.findMany({
      where: { tenantId }, distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' },
    }),
    db.user.findMany({
      where: { tenantId, auditLogs: { some: {} } },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);
  ```
  No `take`, no `createdAt` window, on any of the three. `AuditLog` carries
  indexes on `(tenantId, action, createdAt)` and `(tenantId, entityType,
  createdAt)` (`schema.prisma:10461-10462`), which support the *filtered* list
  query but do not turn an unbounded `DISTINCT` scan into a cheap one —
  PostgreSQL has no native loose/skip-scan for a plain `SELECT DISTINCT`
  without a recursive-CTE rewrite, so the planner still has to visit every
  matching index entry to compute the distinct set, i.e. cost scales with
  **row count**, not with the number of distinct values.

---


Full finding text: DBQ-06 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/DBQ.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Cost grows without bound as exactly the audit trail the product
  advertises as a compliance feature accumulates — the tenants for whom
  Audit & Compliance matters most (regulated, long-tenured, high-activity) are
  the ones who will feel this first, and the query runs on a screen those
  tenants' compliance/HR staff open often.

## Affected Areas

services/api/src/modules/audit

## Proposed Resolution

Cache `getFilterMetadata`'s result per tenant (short TTL or
  invalidate on `AuditService.log()`), or replace the two `DISTINCT` scans with
  reads against `common/constants/permissions.ts`-style static registries
  where the full set of possible `action`/`entityType` values is already known
  at compile time rather than derived from data.

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/audit/audit.repository.ts`,
  `audit.service.ts` (audit id DBQ-06).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: DBQ-06=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `DBQ-06` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/DBQ.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (DBQ-06) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[audit-and-events]]

<!-- GRAPH:END -->
