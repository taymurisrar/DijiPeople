---
ID: BUG-3201
aliases: [BUG-3201]
Title: The P2002 recovery pattern used inside interactive transactions cannot work on Postgres, and it is on the tenant-provisioning path
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/tenants]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-723
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-11-24
ResolvedAt: 2026-11-23
---

# BUG-3201 — The P2002 recovery pattern used inside interactive transactions cannot work on Postgres, and it is on the tenant-provisioning path

> **Architect triage, 2026-09-11 — `FIX_NOW`.** A P2002 recovery that cannot work inside an interactive transaction silently fails to recover. The pattern is wrong wherever it appears, so fix the pattern.

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

Three call sites inserted, caught a unique violation, and recovered by reading on the same client. Inside an interactive transaction Postgres aborts the whole transaction at the failed statement, so the recovery failed with "current transaction is aborted". Two of them also relied on error.meta.target, which Prisma 7 does not populate.

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

services/api/test/identity-concurrent-create.e2e-spec.ts; services/api/src/modules/recruitment/recruitment-draft-employee-savepoint.spec.ts; services/api/src/modules/super-admin/billing-create-invoice.spec.ts. REG-723, QA-PLATFORM-069. Restoring the old identity implementation fails the deterministic uncommitted-winner test with "current transaction is aborted".

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `RES-07` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`

## Resolution

Identity creation uses INSERT ... ON CONFLICT DO NOTHING followed by a read, which raises nothing. The recruitment draft employee insert is wrapped in a SAVEPOINT so a collision is rolled back locally and the recovery reads run. The invoice number is chosen free before inserting and a unique violation from the insert is no longer swallowed: it also swallowed a duplicate stripeInvoiceId five times and reported it as a numbering problem. Verified against real Postgres: the old identity code fails the deterministic test with the reported error, and the savepoint test shows both that the pattern works and that the unprotected sequence aborts. Not examined: other P2002 helper sites outside transactions, which were not part of the verified list.

Fixed on branch agent/dependency-alert-remediation (SESSION-0137). Premise re-verified against the code before changing it.

## QA Retest

QA-PLATFORM-069 on the isolated database, 2026-11-23: passing with the fix and failing with it removed. Independent review pending.

Independent QA retest 2026-11-24 (SESSION-0137 reconciliation): identity-concurrent-create e2e (7 pass) runs twelve concurrent transactions to one row, a deterministic loser-of-uncommitted-race that still commits, and a SAVEPOINT test plus a control showing the unprotected sequence aborts.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (RES-07) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-control-plane]]
- Regression — REG-723 (see the regression register)

<!-- GRAPH:END -->
- 2026-11-24 — FIXED → VERIFIED by independent QA (SESSION-0137 reconciliation).
