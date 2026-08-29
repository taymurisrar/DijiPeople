---
ID: BUG-1967
aliases: [BUG-1967]
Title: Leave entitlement is never allocated to a balance, so every leave request is refused
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/leave]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-1967 — Leave entitlement is never allocated to a balance, so every leave request is refused

## Summary

`LeavePolicyRule.entitlementDays` and `accrualType` are validated and stored, and
nothing ever turns them into a balance. `LeaveBalance` is written in exactly one
place in the API, and that write only ever decrements: `totalAllocated` is
created as literal `0` and is never incremented anywhere. Because
`LeaveType.consumesBalance` defaults to true, the balance gate refuses every
request on every tenant unless a balance row was seeded by a script or the policy
allows a negative balance.

## Expected Behavior

An employee covered by a policy assignment that grants 20 annual days has 20 days
available, by whatever mechanism the product intends — an allocation at
assignment time, a scheduled accrual, or a computed balance. A request within
that entitlement is accepted.

## Actual Behavior

With a Tenant-scoped policy assignment granting 20 Annual days in place:

```
POST /api/leave-requests -> 400 "Insufficient leave balance for this request."
```

Setting `consumesBalance: false` on the leave type made that exact error
disappear — the request then failed further down the pipeline, on approval
routing (BUG-1968).

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Create a leave policy with an entitlement rule of 20 Annual Leave days.
2. Create a Tenant-scoped assignment for it (through the API — the UI cannot, see
   BUG-1961).
3. As an employee with an employee record, `POST /api/leave-requests` for three
   days of Annual Leave.
4. Observe `400 "Insufficient leave balance for this request."`
5. Set `consumesBalance: false` on the Annual Leave type and repeat: that error
   is gone, and the request fails later in the pipeline instead.

## Evidence

Code, at `eb457d9d`:

- `services/api/src/modules/leave/leave.service.ts:1857` — the **only** write to
  `LeaveBalance` in the API, inside `recordApprovedLeaveConsumption`, and it only
  decrements:

```ts
create: { totalAllocated: new Prisma.Decimal(0),
          totalUsed: totalDays,
          totalRemaining: new Prisma.Decimal(0).minus(totalDays) }
update: { totalUsed: { increment: … }, totalRemaining: { decrement: … } }
```

  `totalAllocated` is written once as literal `0` and is never incremented
  anywhere in the codebase.

- `leave.service.ts:576-592` — the balance gate:

```ts
if (!leaveType.consumesBalance) return;
const remaining = balance?.totalRemaining ?? new Prisma.Decimal(0);
if (remaining.greaterThanOrEqualTo(totalDays)) return;
if (!rule?.negativeBalanceAllowed) throw 'Insufficient leave balance for this request.'
```

- `LeaveType.consumesBalance` defaults to **true**, so the gate is armed by
  default for every leave type on every tenant.

- Accrual configuration is validated on write ("Accrual type is required.",
  "Accrual amount cannot be negative.", "Accrual day must be between 1 and 31.")
  and stored — but a search for `accrual` across `services/api/src` returns only
  policy-rule configuration code and one unrelated payroll constant. There is no
  scheduler, job, cron or service that executes an accrual.
  `demo-data.operations.ts` only **counts** `leaveBalance` rows; it does not
  create them.

Live proof as quoted in Reproduction.

**Corroboration on a second leave type, added 2026-08-29.** A Casual Leave
request on the same tenant was refused with the same message:

```
POST /api/leave-requests  (leaveTypeId = Casual Leave)
  -> "Insufficient leave balance for this request."
```

This is the same wall on a different leave type, which establishes it as general
rather than something specific to Annual Leave. Annual Leave submits at all only
because `consumesBalance` was set to `false` on it during this run so that the
downstream approval-routing defect (BUG-1968) could be isolated — that is a QA
workaround, not a configuration a customer would have. With the shipped default
of `consumesBalance: true`, every leave type behaves like Casual Leave here.

## Root Cause

Established: the allocation half of the leave balance model was never
implemented. Configuration is stored and validated, consumption is implemented,
and nothing bridges the two.

## Impact

Release-blocking for the Starter plan, and not limited to it: **every employee on
every tenant** is refused leave unless a balance row was seeded out of band or the
policy allows negative balances. The product accepts a full leave policy
configuration, reports it saved, and then behaves as if the entitlement is zero.

Rated HIGH: a primary journey blocked in production, with a misleading error that
sends the administrator looking at the employee's balance rather than at a
missing feature.

## Affected Areas

`services/api/src/modules/leave` (`leave.service.ts` balance gate and
`recordApprovedLeaveConsumption`), `LeavePolicyRule` accrual configuration, and
the demo-data path that reports balances it never creates.

## Proposed Resolution

Needs an ExecPlan — this is a missing capability, not a patch. The plan must
decide what allocation means in this product: a one-off allocation when an
assignment becomes effective, a periodic accrual driven by `accrualType`, or a
balance computed on read from policy plus consumption. It must also decide what
happens to existing tenants whose `LeaveBalance` rows already carry
`totalAllocated = 0`, and how proration on joining and exit (already configurable
on the rule) participates.

Until it lands, the demo tenant's Annual Leave type has `consumesBalance: false`
so that leave can be demonstrated at all — recorded here so that it is a decision
rather than a discovery.

## Acceptance Criteria

- An employee covered by an assignment granting 20 Annual days can submit a
  three-day Annual request with `consumesBalance` left at its default `true`.
- `totalAllocated` reflects the entitlement rather than staying at 0.
- The balance shown to the employee matches what the gate enforces.
- Consumption still decrements correctly, and the negative-balance rule still
  applies where configured.

## Regression Coverage

None yet. A service test that assigns a policy and asserts a non-zero
`totalAllocated` would fail today.

## Dependencies

None technically, but the leave journey cannot be verified end to end until
BUG-1961, BUG-1965 and BUG-1968 are also resolved.

## Related Items

BUG-1961 (assignments cannot be created from the UI), BUG-1965 (the request form
sends forbidden fields) and BUG-1968 (approval routing) are the other blocks on
the same journey. ITEM-0105 covers the entitlement dialog's inability to set
`accrualType`, which is the configuration side of the accrual this record says is
never executed.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PLAN_REQUIRED — there is no accrual engine at all; this is feature work (accrual job, balance initialisation, proration), not a bug fix.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0105]]

<!-- GRAPH:END -->
