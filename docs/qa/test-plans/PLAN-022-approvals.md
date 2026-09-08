---
PLAN_ID: PLAN-022
aliases: [PLAN-022]
TITLE: Approval routing and the approval matrix
AREA: approvals
STATUS: CURRENT
MODULES: [services/api/src/modules/approvals, services/api/src/modules/leave, services/api/src/modules/workflows, services/api/src/modules/sla]
RISK: HIGH
COVERAGE_UNIT: PARTIAL
COVERAGE_API: GAP
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: GAP
RELATED_BUGS: [BUG-1968, BUG-2015, BUG-1970, BUG-1969]
RELATED_REGRESSIONS: [REG-303, REG-304]
CREATED_AT: 2026-08-29
UPDATED_AT: 2026-08-29
VERIFIED_AGAINST_SHA: a86362cf
---

# PLAN-022 — Approval routing and the approval matrix

## Scope

The approval matrix and the routing decision built on it: which rules match a
submission, which step wins at a given sequence, who each step binds to, and what
happens when a step binds to nobody. `ApprovalMatrixResolverService` is the
centre of it.

Also in scope: the authorization on the act of approving — who may approve, and
whether the guard actually enforces it.

**Excluded:** what happens *after* a route resolves — the approval workflow state
machine, escalation and SLA timers — which belong to `workflows` and `sla`; and
the per-module submission rules (a leave balance, a loan limit), which belong to
those modules. The line is: this plan covers **who is asked**, not **what they
are asked about** or **what happens when they answer**.

> Raised on 2026-08-29 for the same reason [[PLAN-021]] was, and discovered the
> same way: a regression was registered against this area and `rebuild-qa`
> refused it — *"a scenario outside every plan is never selected for a re-run"*.
> That refusal is doing real work. Approval routing is shared by leave,
> timesheets, loans and claims, it had **no plan at all**, and four defects were
> found in it in a single day.

## Risks

Ranked by what has actually gone wrong here, not by imagination:

1. **A gate that is declared and not enforced.** [[BUG-2015]]: approving and
   rejecting a leave request were decorated with `leave-requests.read` in *both*
   permission systems, while the dedicated `approve` and `reject` keys existed,
   were mapped and were granted — and gated only what the UI *displayed*.
   Withholding approve hid the button and did not stop the action. This is the
   highest risk in the area, because the whole point of an approval chain is that
   it is a control.
2. **A refusal nobody can act on.** [[BUG-1968]]: an unresolvable step aborted
   the submission with a message naming the internal requirement and neither the
   step nor the remedy — and stopped at the first failure, so fixing one step
   revealed the next. The seeded chain cannot bind on a new tenant, so this was
   every customer on day one.
3. **The seeded chain itself.** [[ITEM-0113]]: provisioning ships a two-step
   chain a new tenant satisfies neither half of. A default that cannot work is a
   worse failure mode than no default, and it is still open.
4. **Binding to the wrong person, or to somebody who should not qualify.**
   [[BUG-1969]] — an `INVITED` user rejected with a message blaming tenancy;
   [[ITEM-0106]] — an employee blocked until their manager activates their own
   account. Both are consequences of *when* a step is bound rather than of the
   matrix.
5. **Self-approval through an elevated role.** [[BUG-1970]]: the elevated-role
   bypass is evaluated before the self-requester check. **Code-confirmed and
   live-unverified** — and it must not be tested as though it had been observed.
6. **Specificity and sequence.** Two rules matching the same sequence resolve by
   a specificity count. A wrong winner is invisible: the request routes, to the
   wrong approver.

## Preconditions

None beyond a tenant for the unit scenarios — `ApprovalMatrixResolverService`
takes a repository, so its behaviour is testable with a mock and no database, and
that is where the coverage is today.

Anything that exercises the live journey needs more than this plan can assume:
`BUG-1966` (the runtime form swallows the failure), `BUG-1961` and `BUG-1967`
each block the leave path through the UI. Until those are fixed, live probing
happens against the API directly, and a scenario that says so is being honest
rather than lazy.

## Test Types

- **UNIT** — where all the coverage is. Rule matching, specificity, step binding,
  and the refusal. `approval-matrix-resolver.service.spec.ts`.
- **SECURITY** — a gap *in this area*, which needs explaining rather than
  reading as "nothing checks it". The one case that exists,
  [[QA-AUTHZ-013]], is filed under `authorization` and belongs to [[PLAN-002]];
  it is listed below because this plan cares about it, not because this area
  covers it. The equivalent guard on timesheets, loans and claims is covered by
  nobody, and [[BUG-2015]] is the reason to go and look.
- **API** — applicable and absent. No test submits through a real endpoint
  against a real matrix.
- **BROWSER_E2E** — blocked by the three defects above rather than by the
  harness, which now exists.

## Data Requirements

Matrix rules constructed in the test, not seeded. A seeded chain would make these
scenarios pass or fail for reasons they do not state — which is precisely how
[[BUG-1968]] was misdiagnosed the first time: the tenant already carried a seeded
two-step chain, so a newly added rule appeared to change nothing, and that read as
"the matrix is ignored".

No real employee names, no credentials.

## Security Cases

- Approving requires the permission to approve, in **both** permission systems,
  and not merely the permission to read — [[QA-AUTHZ-013]].
- The same holds for rejecting, and for the equivalent routes on timesheets,
  loans and claims. **Not covered.**
- A requester cannot approve their own request, including via an elevated role
  ([[BUG-1970]], unverified).
- Matrix rules are tenant-scoped: a rule cannot bind an approver from another
  tenant.

## Negative Cases

- A chain with an unbindable step refuses, names every unbindable step by
  sequence, and names what to configure — [[QA-RUNTIME-017]].
- A step that *does* bind is not named in that refusal.
- No matched rule at all falls through to the configured fallback, which is a
  different path from an unbindable rule and must not be conflated with it.
- A rule naming a role with no active users, and a rule naming no role at all,
  are distinct configuration errors with distinct remedies.

## State Transitions

A resolved route is a list of steps in sequence order, merged by
`mergeResolvedSteps`. Two rules at the same sequence with different approval
modes is a configuration error the resolver rejects — worth its own scenario,
which does not exist.

Deactivating the last holder of an approver role changes a working chain into an
unroutable one with no event at the moment of the change. That transition is
where the area is most brittle and is entirely uncovered; it is the substance of
[[ITEM-0113]].

## Integration Cases

None. Approval routing calls no third party. Its inputs are the matrix, the
employee hierarchy and role membership — all local.

## Browser Cases

An administrator looking at the Approval Matrices screen cannot tell whether a
rule can currently bind. Nothing proves this today and nothing can until it is
built; it is the second half of [[ITEM-0113]].

## Regression Links

- REG-303 — approving a leave request requires the permission to approve
  ([[QA-AUTHZ-013]], [[BUG-2015]])
- REG-304 — an unroutable chain refuses and names every step that cannot bind
  ([[QA-RUNTIME-017]], [[BUG-1968]])

<!-- GRAPH:BEGIN — generated by scripts/rebuild-qa.mjs; edit the frontmatter, not this block -->

## Related

- Scenarios — [[QA-RUNTIME-017]], [[QA-RUNTIME-022]], [[QA-RUNTIME-027]], [[QA-RUNTIME-028]], [[QA-RUNTIME-039]]
- Module — [[approvals]]
- Bugs — [[BUG-1968]], [[BUG-2015]], [[BUG-1970]], [[BUG-1969]]
- Regressions — REG-303, REG-304 (see the regression register)

<!-- GRAPH:END -->
