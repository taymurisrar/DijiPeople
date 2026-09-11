---
ID: BUG-3201
aliases: [BUG-3201]
Title: The P2002 recovery pattern used inside interactive transactions cannot work on Postgres, and it is on the tenant-provisioning path
Status: OPEN
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
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

# BUG-3201 — The P2002 recovery pattern used inside interactive transactions cannot work on Postgres, and it is on the tenant-provisioning path

## Summary

The P2002 recovery pattern used inside interactive transactions cannot work on Postgres, and it is on the tenant-provisioning path

Identified by the 2026-09-10 full technical audit as RES-07 (confidence: RES-07=CONFIRMED (the mechanism is proven empirically in this repository at this Prisma version by BUG-0070)).

## Expected Behavior

either do the dedupe with `INSERT ... ON CONFLICT DO
  NOTHING` in raw SQL (exactly what `OutboxService.emit` does), or hoist the
  create out of the transaction, or wrap each attempt in an explicit `SAVEPOINT`.

## Actual Behavior

when the unique constraint actually fires, the
  transaction is already aborted. The recovery read throws
  `current transaction is aborted` rather than returning the winning row, and
  the retry loop's next `create` throws the same. The caller sees an opaque
  driver error instead of the graceful "someone else got there first" outcome
  the code was written to produce — and the whole enclosing transaction rolls
  back.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**RES-07** (`services/api/src/modules/users/identity.service.ts`, `services/api/src/modules/recruitment/recruitment.service.ts`):

The mechanism, documented in this repository from a real failure —
  `services/api/src/modules/outbox/outbox.service.ts:41-52`:
  ```
  BUG-0070 — why this is `ON CONFLICT DO NOTHING` and not try/catch.
  ... a constraint violation **aborts the surrounding transaction**, so the read
  in the catch block fails with "current transaction is aborted, commands
  ignored until end of transaction block" — and because `emit` is required to
  run inside the caller's transaction, it poisons the caller's business write too.
  ```
  `docs/bugs/BUG-0070-...md:46` records the observed error:
  `DriverAdapterError: current transaction is aborted`.

  The same unusable pattern, on the provisioning path —
  `services/api/src/modules/users/identity.service.ts:53-74`:
  ```ts
  try {
    const created = await db.identity.create({ data: { email, passwordHash: ... } });
    return created.id;
  } catch (error) {
    ...
    const holder = await db.identity.findUnique({ where: { email }, select: { id: true } });
    if (holder) return holder.id;
    throw error;
  }
  ```
  `db` is a transaction client at every real caller:
  `super-admin.service.ts:1402` (`ensureIdentityForEmail(tx, ...)`),
  `tenant-control-plane/tenant-access.service.ts:212`, and
  `users.repository.ts:825`, which is itself invoked from
  `platform-onboarding.service.ts:246` inside `provisionTenantForCustomer`'s
  `$transaction`.

  And again in recruitment — `recruitment.service.ts:1790-1852`, a five-attempt
  retry loop whose `continue` re-issues `params.tx.employee.create` after a
  P2002, and whose duplicate recovery is `params.tx.employee.findFirst` at
  `:1836`. `params.tx` is `Prisma.TransactionClient`
  (`recruitment.service.ts:1737`) supplied by `$transaction` at `:1260` and
  `:1354`.

---


Full finding text: RES-07 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

on the provisioning path this is a paid customer with no workspace —
  the same class of outcome as BUG-0900 (CRITICAL). Two people signing up with
  the same email at once, or a redelivered `PROVISIONING_REQUESTED` racing a
  manual provision, aborts the provisioning transaction with an error the outbox
  will retry and fail identically eight times. In recruitment it fails a HIRED
  stage transition.

## Affected Areas

services/api/src/modules/tenants

## Proposed Resolution

rewrite `ensureIdentityForEmail` to a raw
  `INSERT INTO "Identity" ... ON CONFLICT ("email") DO NOTHING RETURNING "id"`
  followed by a normal read, copying `OutboxService.emit` verbatim in shape. Do
  the same for the employee-code loop in
  `recruitment.service.ts:ensureDraftEmployeeForHiredApplication`, or move it
  outside `tx`. Add an invariant spec that fails on `catch (P2002)` followed by a
  read on a `TransactionClient`.

(Difficulty: MEDIUM; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/users/identity.service.ts`, `services/api/src/modules/recruitment/recruitment.service.ts` (audit id RES-07).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: RES-07=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `RES-07` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (RES-07) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-control-plane]]

<!-- GRAPH:END -->
