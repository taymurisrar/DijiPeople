---
PLAN_ID: PLAN-023
aliases: [PLAN-023]
TITLE: Leave entitlement, balance and the request lifecycle
AREA: leave
STATUS: CURRENT
MODULES: [services/api/src/modules/leave]
RISK: HIGH
COVERAGE_UNIT: PARTIAL
COVERAGE_API: GAP
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: GAP
RELATED_BUGS: [BUG-1967, BUG-1966, BUG-1962, BUG-1970]
RELATED_REGRESSIONS: [REG-306]
CREATED_AT: 2026-08-29
UPDATED_AT: 2026-08-29
VERIFIED_AGAINST_SHA: 9def9971
---

# PLAN-023 — Leave entitlement, balance and the request lifecycle

## Scope

The leave module's own rules: how a policy entitlement becomes a balance, how a
balance is consumed, and the per-request checks — notice period, consecutive-day
limits, overlap, attachment requirement, negative balance.

**Excluded:** who approves a request and whether the chain can route, which is
[[PLAN-022]]'s; and the authorization on the act of approving, which is
[[PLAN-002]]'s. The line is: this plan covers **what is asked for and whether it
is allowed by policy**, not **who is asked**.

> Raised on 2026-08-29 alongside the BUG-1967 fix, for the third time in this
> repository the same way [[PLAN-021]] and [[PLAN-022]] were: a regression was
> registered against an area with no plan, and `rebuild-qa` refused it. Leave is
> a primary journey and had no plan at all.

## Risks

Ranked by what has actually gone wrong:

1. **A configured number that reaches nothing.** [[BUG-1967]]:
   `entitlementDays` was validated, stored, shown in the UI — and never turned
   into a balance. `totalAllocated` was created as literal zero and incremented
   nowhere, so the balance gate refused every request on every tenant. Half of a
   model can be built, tested and reviewed while the other half does not exist.
2. **Allocating from the wrong policy.** Exactly one policy wins per employee by
   specificity. Allocation that assumed the triggering assignment wins would
   write a number no governing policy justifies — and the gate would enforce it.
   Guarded by [[QA-RUNTIME-021]].
3. **Arithmetic that silently favours the employer or the employee.**
   `totalRemaining` is derived, `totalUsed` must never move during allocation,
   and a negative remaining must not be clamped.
4. **A failure the employee never sees.** [[BUG-1966]]: the runtime form
   swallows the refusal, so a correct, well-worded 400 reaches nobody.
5. **Self-approval.** [[BUG-1970]], code-confirmed and live-unverified.

## Preconditions

Unit scenarios need no database — the entitlement service takes a repository and
a resolver, both mockable.

The live journey needs a tenant with an employee, an active leave type with
`consumesBalance: true`, a policy with a rule granting days, and an assignment.
It additionally needs a routable approval chain ([[PLAN-022]]), which is why the
end-to-end scenario is not yet runnable and says so.

## Test Types

- **UNIT** — where the coverage is: entitlement allocation, and the existing
  `leave.service.spec.ts` range and leave-type cases.
- **API** — applicable and absent. No test submits a leave request through a real
  endpoint against a real balance.
- **DATABASE** — applicable and absent. `LeaveBalance` is a derived table and
  nothing checks it converges with `LeaveConsumptionRecord`.
- **BROWSER_E2E** — blocked behind [[BUG-1966]] rather than behind the harness.

## Data Requirements

Policies, rules and balances constructed in the test. Not seeded: the demo tenant
is deliberately configured *around* these defects — Annual Leave carries
`consumesBalance: false` and two seeded approval matrices are deactivated — so a
test leaning on it would pass for reasons it does not state.

## Security Cases

Covered by [[PLAN-002]] and [[PLAN-022]] rather than here. Noted so the gap is a
boundary rather than an oversight.

## Negative Cases

- A request beyond the entitlement is refused, unless the policy allows a
  negative balance and the request stays within its maximum.
- An employee covered by no policy is not silently allocated zero days.
- A rule granting no entitlement writes no balance row at all, rather than a row
  of zero that reads as a deliberate allocation of nothing.

## State Transitions

Allocation is idempotent and recomputed from the winning policy, so it is
self-correcting: removing an assignment recomputes the now-lower entitlement on
the next reconcile. Consumption moves `totalUsed` on approval only.

The transition **not** covered anywhere: the leave year rolling over. Nothing in
the product resets or carries forward a balance, and full-entitlement-up-front
allocation makes that question due rather than optional. See [[BUG-1967]].

## Integration Cases

None. Leave calls no third party.

## Browser Cases

The balance an employee sees must equal what the gate enforces. Unprovable today:
[[BUG-1966]] means a refusal never reaches the screen.

## Regression Links

- REG-306 — a leave entitlement becomes a leave balance, from the policy that
  wins ([[QA-RUNTIME-021]], [[BUG-1967]])

<!-- GRAPH:BEGIN — generated by scripts/rebuild-qa.mjs; edit the frontmatter, not this block -->

## Related

- Scenarios — [[QA-RUNTIME-021]]
- Bugs — [[BUG-1967]], [[BUG-1966]], [[BUG-1962]], [[BUG-1970]]
- Regressions — REG-306 (see the regression register)

<!-- GRAPH:END -->
