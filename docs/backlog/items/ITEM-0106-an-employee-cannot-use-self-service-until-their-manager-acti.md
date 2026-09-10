---
ID: ITEM-0106
aliases: [ITEM-0106]
Title: An employee cannot use self-service until their manager activates their own account
Type: PRODUCT_DECISION
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api/src/modules/leave, services/api/src/modules/employees, services/api/src/modules/approvals]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: DONE
CreatedAt: 2026-08-29
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
RelatedBug: BUG-1968
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0106 — An employee cannot use self-service until their manager activates their own account

## Summary

Provisioning system access for an employee creates a user with status `INVITED`.
While a manager is `INVITED`, none of their reports can submit leave: approval
routing requires a reporting manager with a linked **active** user. In a real
onboarding, an entire team is therefore blocked behind one person clicking a link
in an email.

This is filed as a product decision rather than a defect. The mechanical failure
is recorded in BUG-1968 (routing demands an active reporting manager and ignores
the approval matrix) and BUG-1969 (an invited approver is rejected with a
message about tenancy). What is left here is the question those two cannot
answer: what should the product do during the window between provisioning a
manager and that manager activating?

## Why It Matters

Onboarding is exactly when a tenant configures managers, reporting lines and
policies, and exactly when nobody has activated anything yet. A design that
requires an active manager before any report can act makes the first days of a
tenant's life the least functional, and the blocking dependency is invisible: the
report sees an error about a reporting manager, not about an unactivated account
belonging to someone else.

It also interacts badly with a demo or trial: the fastest path to showing leave
working requires a deliverable mailbox for a second person.

## Evidence

Observed 2026-08-29 on `https://dijipeople-demo.ws.dijipeople.com`, tenant
`DijiPeople Demo`, production API commit `949f461c`:

- `POST /employees/:id/provision-access
  {"provisionSystemAccess":true,"sendInvitationNow":false}` creates a user with
  status `INVITED`. (Done for EMP-0002, `omar.haddad@demo.dijipeople.com`; no
  email was sent.)
- With that manager `INVITED`, a report's `POST /api/leave-requests` fails with
  `400 "Approval route requires a reporting manager with a linked active user."`
- The same error appears when the requester has no reporting manager at all, and
  when a matching approval matrix exists — see BUG-1968 for those two.

## Proposed Approach

A product call, then whatever engineering it implies. The options worth weighing:

- let an `INVITED` user hold an approval step, so routes can be configured ahead
  of activation and the step waits;
- fall back to a configured approval matrix when the manager is not yet active
  (which BUG-1968 says should be happening anyway);
- fall back to a tenant-level approver or HR role during onboarding;
- keep the current rule but tell the report, and the tenant administrator,
  precisely who needs to activate.

The last is the minimum: whatever the rule, the message should name the blocking
account rather than describing an internal precondition.

## Acceptance Criteria

- A decision is recorded — ideally as an ADR — about whether an unactivated user
  may hold an approval step.
- A tenant in its first hour can configure leave approval without a second person
  reading email.
- Where the rule still blocks, the error names the account that must activate.

## Dependencies

Overlaps BUG-1968 and BUG-1969; the decision here shapes both fixes and should be
made before either is implemented.

## Related Items

BUG-1968 (approval routing requires an active reporting manager and ignores the
matrix), BUG-1969 (invited approver rejected with a tenancy message), BUG-1970
(whose live verification is blocked partly by this).

## Resolution

**Decided by the repository owner, 2026-09-11: let invited managers approve.**
Of the options this record weighed, the owner chose the first and the second
together — accept an `INVITED` reporting manager as a valid approver, and fall
back to the rest of the configured approval matrix when there is no active or
invited manager to route to at all. Onboarding must work from day one; the
fourth option (keep blocking, just name the account) was not taken.

Implemented in `services/api/src/modules/approvals`:

- `ApprovalMatrixRepository.findApprovableManagerById` (new) looks a reporting
  manager up with `status IN (ACTIVE, INVITED)` instead of the `ACTIVE`-only
  `findUserById`. `ApprovalMatrixResolverService.resolveApprovers` uses it for
  the `LINE_MANAGER` / `MANAGER` / `REQUEST_OWNER_MANAGER` approver types —
  BUG-1968's exact failure point (`approval-matrix-resolver.service.ts:277`
  at the time this was filed). This alone fixes the reproduction in this
  record: EMP-0002's `INVITED` manager can now be resolved as the approver, so
  their reports are no longer blocked.
- Separately, a reporting-manager step that still cannot resolve — nobody is
  assigned, or the assigned account is disabled or missing — no longer blocks
  the whole submission **when another step in the chain can carry it** (for
  example the seeded HR fallback). A new `UnresolvedManagerStep` refusal is
  recognised by the resolver's per-step loop and folded back into the
  ordinary "step nobody can approve" refusal only if nothing else in the chain
  resolves either. This is the narrow, deliberate exception to BUG-1968's
  "refuse, but say what is missing" policy that this decision authorises: that
  policy still holds for every other approver type, and holds for the
  reporting-manager step too whenever it is the only step in the chain.
- Naming an `INVITED` user as a directly-configured `USER`-type approver in
  the approval matrix (as opposed to a *derived* reporting manager) is
  unchanged and stays out of scope — BUG-1969 already identified that the
  route resolver does not check a `USER` approver's status at all, which is a
  gap that needs closing before that specific door is opened, and this
  decision only asked about reporting managers.

Regression coverage: `services/api/src/modules/approvals/approval-matrix-resolver.service.spec.ts`,
new describe block `ITEM-0106 - an invited or unassigned reporting manager
does not block a chain with an alternative` — four cases: an invited manager
resolves and is looked up through the widened predicate (asserted by checking
which repository method was called, not by parsing a status string); no
manager assigned falls through to a resolvable HR step; an assigned-but-
inactive manager likewise falls through; and a chain with no alternative at
all still refuses, naming both steps that could not resolve, exactly as
BUG-1968 left it.
All pre-existing tests in that file — including the BUG-1968 "the policy did
not loosen" describe block — pass unchanged.

Against the acceptance criteria this record was created with: an `INVITED`
manager may now hold an approval step (criterion 1, the "let it hold a step"
branch); a tenant can route leave in its first hour without a second person
reading email, provided the chain has an HR or other fallback step (criterion
2) — a chain consisting of *only* an unconfigured reporting-manager step still
has nothing to route to and still refuses; and where the rule still blocks,
the message is the existing BUG-1968 per-step remedy rather than naming the
specific blocking account by email (criterion 3 is met only partially — the
owner's decision text did not ask for account-naming, so it was not built).

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`. Filed as a product decision: the mechanics are recorded in BUG-1968 and BUG-1969, the intended behaviour is not decided.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PRODUCT_DECISION — a genuine onboarding design question — is a manager activation a hard prerequisite, or should an HR fallback approver apply; ties to BUG-1968.
- 2026-09-11 — **decided and implemented.** The repository owner chose to accept an invited reporting manager as an approver and to fall back to the rest of the approval matrix when no active or invited manager exists. `ApprovalMatrixResolverService` and `ApprovalMatrixRepository` changed accordingly; see Resolution. ArchitectDisposition PRODUCT_DECISION to DONE.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-1968]]
- Modules — [[employees]], [[approvals]]

<!-- GRAPH:END -->
