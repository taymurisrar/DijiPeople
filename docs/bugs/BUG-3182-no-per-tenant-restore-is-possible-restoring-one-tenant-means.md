---
ID: BUG-3182
aliases: [BUG-3182]
Title: No per-tenant restore is possible: restoring one tenant means rolling back all of them
Status: OPEN
Severity: HIGH
Priority: P1
Type: INFRA
Source: REVIEWER
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

# BUG-3182 — No per-tenant restore is possible: restoring one tenant means rolling back all of them

## Summary

No per-tenant restore is possible: restoring one tenant means rolling back all of them

Identified by the 2026-09-10 full technical audit as INF-14 (confidence: INF-14=CONFIRMED (searched specifically; no mechanism exists)).

## Expected Behavior

A documented procedure: restore the full database into a Neon branch, connect to it, and extract one tenant's rows in foreign-key-safe order into the live database.

## Actual Behavior

If one tenant's data is corrupted or wrongly deleted, the only recovery is a whole-database point-in-time restore, which would roll back **every other tenant** to the same moment. Within six hours that is technically possible and commercially unacceptable; after six hours it is not possible at all (INF-02).

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**INF-14** (docs/deployment/, services/api/src/modules/data-management/):

There is no restore runbook of any kind:
`git ls-files | grep -iE "runbook|disaster|backup|restore"` returns exactly two
runbooks — `docs/deployment/rollback-runbook.md` and
`docs/deployment/incident-response.md` — and neither describes a restore. No
file in `docs/` covers backup or restore at all.

The nearest capability is per-module CSV export, and it is narrow.
`services/api/src/modules/data-management/export-execution.service.ts:81-89`
wires exactly two modules:
```ts
this.employeesService.exportEmployees(user, { … });
const result = await this.attendanceService.exportAttendance(user, { … });
```
with `:113` and `:119` throwing `"${module.label} does not support export yet."`
for everything else. That is a data-portability feature for employees and
attendance, not a restore path — it cannot round-trip payroll runs, approvals,
documents, audit history or any relational structure.

There is a *deletion* order (`TENANT_ERASURE_DELETE_ORDER`, referenced at
`docs/deployment/release-history/2026-08-31-production-cace6cd.md:105`) — the
platform knows how to remove one tenant across every table. Nothing knows how
to put one back.

---


Full finding text: INF-14 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

The scenario is ordinary, not exotic. A tenant admin runs a bad bulk import or a mistaken bulk delete and asks for yesterday's data back. The honest answer today is that it cannot be done, and nobody has written that down or told anybody.

## Affected Areas

services/api/src/modules/tenants

## Proposed Resolution

This is genuinely hard and should be scoped honestly rather than promised:
1. The enabling primitive is cheap and already available: **Neon branching**. Restoring a point-in-time branch and connecting to it read-only is minutes of work and destroys nothing. Document that as step one.
2. `TENANT_ERASURE_DELETE_ORDER` already enumerates every tenant-owned table in dependency order. **Reversed, it is the insert order.** A `scripts/extract-tenant.mjs` that walks it against a restored branch and emits per-table data is a bounded piece of work and reuses an ordering the project already maintains and tests.
3. Write `docs/deployment/tenant-restore-runbook.md` stating what is possible, what is not, and the expected duration — including the case where the answer is "no".
Do (1) and (3) now; (2) when a customer first asks.

(Difficulty: HIGH; Regression risk: LOW (all of it operates on a branch, never on production); Fix now: LATER — but INF-02's retention increase is the prerequisite and is YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for docs/deployment/, services/api/src/modules/data-management/ (audit id INF-14).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: INF-14=LOW (all of it operates on a branch, never on production). Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `INF-14` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (INF-14) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-control-plane]]

<!-- GRAPH:END -->
