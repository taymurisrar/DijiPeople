---
ID: PLAN-026
aliases: [PLAN-026, EXECPLAN-0026]
Title: Leave entitlement allocation
Status: APPROVED
Session: SESSION-0071
Type: BUG
Size: MEDIUM
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
---

# EXECPLAN-0026 — Leave entitlement allocation

```
CONTEXT_FILES_REQUIRED:
  - .agent/context/task-completion-contract.md
  - .agent/context/failure-adaptation.md
  - .agent/context/test-resource-policy.md

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API                        — the allocation service and its wiring
  - Database                           — no schema change, but the write pattern
                                         and index behaviour on a tenant-wide fan-out
  - QA                                 — the journey this unblocks has never run end to end
DELIBERATELY_NOT_USED:
  - Frontend                           — no UI changes; the existing balance screens
                                         read `LeaveBalance` and start working once it
                                         carries a non-zero `totalAllocated`
  - Security                           — no new endpoint, no new permission; allocation
                                         runs inside an already-guarded write

SINGLE_WRITER_FILES:
  - none                               (no schema change — see Database impact)

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - docs/qa/known-bug-patterns/doc-code-drift.md

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-304 — an unroutable approval chain refuses and names every step
  - REG-305 — a related record created without its parent

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no        (ordinary task; ships with the next release)
DEPLOYMENT_COMPONENTS:    api
DEPLOYMENT_ORDER:         api
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           rebase
KNOWN_CONCURRENT_WORK:    none known on services/api/src/modules/leave
ENVIRONMENT_DEPENDENCIES: none
```

## Objective

Make a leave entitlement into a leave balance, so that an employee covered by a
policy granting 20 annual days can actually take annual leave.

## Business requirement

**FACT.** BUG-1967: `LeavePolicyRule.entitlementDays` and `accrualType` are
validated and stored, and nothing ever turns them into a balance. `LeaveBalance`
is written in exactly one place in the API — `leave.service.ts:1857` — and that
write only ever decrements. `totalAllocated` is created as literal
`new Prisma.Decimal(0)` and is never incremented anywhere.

**FACT.** `LeaveType.consumesBalance` defaults to true, so the balance gate at
`leave.service.ts:578` refuses every request on every tenant unless a balance row
was seeded by a script or the policy allows a negative balance.

**Decision, repository owner, 2026-08-29:** allocate the **full annual
entitlement up front**, at policy assignment. Not a scheduled accrual, and not a
balance computed on read. That settles the question BUG-1967 said the plan had to
answer.

## Existing behavior

**FACT.** The consumption half is complete and correct:

- `validateLeaveRequestAgainstPolicy` reads `LeaveBalance.totalRemaining`,
  defaulting to zero when no row exists, and refuses when it is short — honouring
  `negativeBalanceAllowed` and `maximumNegativeBalance`.
- On approval, a `LeaveConsumptionRecord` is created and the balance is upserted
  with `totalUsed` incremented and `totalRemaining` decremented. The upsert's
  `create` branch is what writes `totalAllocated: 0`.

**FACT.** `resolveApplicableLeavePolicy(tenantId, employee, at)` selects exactly
**one** winning policy per employee, by specificity rank — EMPLOYEE 6,
EMPLOYEE_LEVEL 5, DEPARTMENT 4, BUSINESS_UNIT 3, ORGANIZATION 2, and TENANT below
those — then by the assignment's `priority`.

## Existing architecture

**INFERENCE, and the load-bearing one in this plan.** Because exactly one policy
wins per employee, allocation must **not** fan out from the assignment being
created and allocate its own policy's entitlements. A newly created assignment
may *lose* to a more specific one that already exists. If allocation assumed the
new assignment wins, an employee with a personal EMPLOYEE-scoped policy would
have their balance overwritten from a TENANT-scoped policy that does not govern
them — and the gate would then enforce against a number no policy justifies.

So allocation resolves, per affected employee, **the same way the gate does**:
`resolveApplicableLeavePolicy`, then that policy's rules. The assignment is the
*trigger*; it is not the *source*.

This also makes the operation naturally idempotent and self-correcting: running
it again for an employee recomputes the same answer, and running it after an
assignment is deleted recomputes the now-correct lower one.

## Requirements

1. Creating, updating or deactivating a leave policy assignment allocates
   entitlement for every employee whose winning policy changes as a result.
2. Allocation sets `totalAllocated` to the winning rule's `entitlementDays` per
   leave type, and recomputes `totalRemaining = totalAllocated - totalUsed`.
3. It never alters `totalUsed`. Consumption is the other half's business, and an
   allocation that could move `totalUsed` could erase a taken day.
4. It is idempotent: running twice produces the same rows.
5. `totalRemaining` may go negative when an employee has already taken more than
   a newly reduced entitlement. That is a true statement about their position and
   must not be clamped to zero.
6. Employees covered by no policy are left alone rather than zeroed.

## Dependencies

BUG-1961 had to land first: allocation triggers on assignment, and until
`9def9971` an assignment could not be created through the UI at all. It is fixed.

## Files / modules affected

- `services/api/src/modules/leave/leave-entitlement.service.ts` — new
- `services/api/src/modules/leave/leave.service.ts` — call the new service from
  the three assignment mutations
- `services/api/src/modules/leave/leave.repository.ts` — the employee lookup for
  a scope, and the balance upsert
- `services/api/src/modules/leave/leave.module.ts` — provider wiring
- `services/api/src/modules/leave/leave-entitlement.service.spec.ts` — new

## Database impact

**None to the schema.** `LeaveBalance` already carries `totalAllocated`,
`totalUsed`, `totalRemaining` and a `@@unique([tenantId, employeeId, leaveTypeId])`
that the upsert keys on. This is the reason `SINGLE_WRITER_FILES` is `none` and
`ROLLBACK_CLASS` is `CODE_ONLY`: no migration, so nothing to undo but code.

**Write volume.** A TENANT-scoped assignment on a large tenant touches every
employee times every leave type in the policy. Processed in chunks so a large
tenant cannot hold one long write lock.

**As built, the writes are not wrapped in a transaction per chunk.** Each balance
upsert stands alone, so an interrupted reconcile leaves some employees updated
and some not. That is tolerable precisely because the operation is idempotent and
recomputed from the winning policy — the next assignment change finishes the job,
and no intermediate state is wrong, only incomplete. Recorded because the plan
originally said otherwise and the difference is deliberate.

## Backend impact

A new `LeaveEntitlementService` with `reconcileTenant`, which walks the
tenant's employees in chunks and delegates to a per-employee
`reconcileEmployee`. Called from `createLeavePolicyAssignment`,
`updateLeavePolicyAssignment` and `deleteLeavePolicyAssignment`.

A reconciliation failure logs and does not fail the assignment write: the
administrator's change is correct and saved, entitlement is derived from it, and
the next assignment change recomputes it. Losing the write to a reconciliation
error would be the worse outcome.

## Frontend impact

None. The balance surfaces already read `LeaveBalance`; they have been showing a
correct rendering of zero.

## Permission / RBAC impact

None. Allocation runs inside the assignment write, which is already guarded.
It introduces no endpoint and no key.

## Tenant-isolation impact

Every query is scoped by `tenantId` taken from `currentUser`, threaded explicitly
into the service because it runs below the request context. The employee lookup
filters on `tenantId` and the balance upsert keys on a composite unique that
begins with `tenantId`.

## Audit / event / logging impact

Allocation is a state change a tenant admin would want to see, but it is a
*consequence* of the assignment write, which is already audited. A second audit
row per employee on a tenant-wide fan-out would be thousands of rows describing
one action. **PROPOSAL:** log a single summary line — how many employees and
balances were reconciled — and leave the audit row on the assignment.

## Integration impact

None.

## Migration / data compatibility

**Existing tenants carry `LeaveBalance` rows with `totalAllocated = 0`.** The
reconciler corrects them on the next assignment write, but an untouched tenant
stays broken until somebody edits an assignment.

**PROPOSAL, and flagged for the owner rather than assumed:** no automatic
backfill in this plan. A backfill would rewrite balances across every tenant in
production, including the demo tenant that has been deliberately configured
around this bug (`consumesBalance: false` on Annual Leave). That is a data
migration on live tenants and belongs in a `RELEASE` task with its own rollback
section, not folded into a defect fix. The reconciler is written so the backfill
is later a loop over tenants calling the same method.

## Parallel-safe tasks

- `PARALLEL_SAFE` — the service and its spec
- `PARALLEL_SAFE` — the repository helpers

## Dependency-blocked tasks

- `DEPENDENCY_BLOCKED` — wiring into the three mutations, on the service existing

## Integration tasks

- `INTEGRATION` — run the api suite, framework validation, and integrate to
  `develop` behind a CI verdict

## Testing strategy

Unit, against a mocked repository, in the pattern of
`approval-matrix-resolver.service.spec.ts`:

- allocates the winning policy's entitlement, **not** the triggering
  assignment's, when a more specific assignment exists — the test that pins the
  central design decision, and the one that fails under the naive implementation
- recomputes `totalRemaining` as allocated minus used, leaving `totalUsed` alone
- is idempotent across two runs
- leaves an employee covered by no policy untouched rather than zeroing them
- allows `totalRemaining` to go negative when entitlement is reduced below days
  already taken

## Risks

1. **Allocating from the wrong policy** — mitigated by reusing the gate's own
   resolver, and pinned by the first test above.
2. **A long write on a large tenant** — mitigated by chunking.
3. **Overwriting a manually seeded balance.** Tenants have been worked around
   this bug with seeded rows. Reconciliation will overwrite `totalAllocated` with
   the policy answer. That is correct — the policy is the source of truth — but
   it is a visible change for anyone who compensated by hand, and is the second
   reason the backfill is not automatic.

## Rollback considerations

`CODE_ONLY`. Reverting the commit stops future reconciliation; balances already
corrected stay corrected, which is the desired direction and not a state anyone
needs restored.

## Definition of Done

- The five unit tests pass and the first is mutation-tested against the naive
  "allocate the triggering assignment's policy" implementation.
- `npm --workspace api run test`, `check-types` and `lint` pass.
- BUG-1967 acceptance criteria 1 to 4 are met, except that the end-to-end
  submission in criterion 1 is verified by test rather than live — the live
  journey additionally needs BUG-1966.
- A REG entry and a QA scenario exist.
- The backfill question is put to the repository owner rather than decided here.

## Related

The defect this plan closes is [[BUG-1967]]. It could not be executed until
[[BUG-1961]] landed, because allocation triggers on a policy assignment and an
assignment could not be created through the UI at all. [[BUG-1968]] and
[[ITEM-0113]] are why the journey it unblocks still cannot be walked end to end:
the balance gate is no longer the blocker, and it is no longer the only one.
[[BUG-1966]] is why the employee sees nothing when any of it refuses.

QA coverage for the area lives in [[PLAN-023]], raised alongside this work
because leave had no test plan at all.
