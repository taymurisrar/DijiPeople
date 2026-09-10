---
ID: BUG-3234
aliases: [BUG-3234]
Title: Deleting a user nulls the actor on every audit row they ever wrote
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: f36749b3
AffectedModules: [services/api/src/modules/audit, services/api/src/modules/users]
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

# BUG-3234 — Deleting a user nulls the actor on every audit row they ever wrote

## Summary

Deleting a user nulls the actor on every audit row they ever wrote

Identified by the 2026-09-10 full technical audit as OBS-20 (confidence: OBS-20=CONFIRMED).

## Expected Behavior

`onDelete: Restrict` on the audit relation, or denormalise actor identity (id + e-mail + name at the time) into the row so deletion cannot erase it. The service already does exactly this for platform actors — `audit.service.ts:92-100` snapshots `{ id, email, fullName, role }` into `scope`.

## Actual Behavior

An administrator who deletes a user erases that user's attribution across the tenant's entire audit history in one operation. The rows survive; the "who" does not.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**OBS-20** (services/api/prisma/schema.prisma):

`services/api/prisma/schema.prisma:10457`:
```prisma
actorUser User? @relation("AuditLogActor", fields: [actorUserId], references: [id], onDelete: SetNull)
```
Same at `:10481` for `PlatformAuditLog.platformActorUser`.
A hard user delete exists and is reachable: `modules/users/users.service.ts:500 async remove(`.
The read side then renders the row as unattributed — `modules/audit/audit.service.ts:158`: `: 'System',`.

---


Full finding text: OBS-20 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

A deliberate cover-up is a single `DELETE /users/:id` away, and it is itself audited only as `USER_DELETED` — one row, next to hundreds now reading "System".

## Affected Areas

services/api/src/modules/audit, services/api/src/modules/users

## Proposed Resolution

Denormalise `actorEmail`/`actorName` onto `AuditLog` at write time (extend `resolveTenantAuditActor`), and change `onDelete` to `Restrict`.

(Difficulty: MEDIUM (migration + backfill); Regression risk: MEDIUM; Fix now: LATER)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/prisma/schema.prisma (audit id OBS-20).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: OBS-20=MEDIUM. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `OBS-20` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (OBS-20) at `f36749b3`.
