---
ID: ITEM-0113
aliases: [ITEM-0113]
Title: The seeded leave approval chain cannot route on a newly provisioned tenant, and the Approval Matrices screen gives no warning
Type: PRODUCT_DECISION
Status: PRODUCT_DECISION
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api/prisma, services/api/src/modules/approvals, apps/web]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
RelatedBug: BUG-1968
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0113 — The seeded leave approval chain cannot route on a newly provisioned tenant, and the Approval Matrices screen gives no warning

## Summary

BUG-1968 is fixed in the sense the repository owner chose: an approval chain with
a step nobody can approve still refuses the submission, but the refusal now names
every unresolvable step by sequence and says what to configure. Two things that
record raised were deliberately **not** done in that pass, because both are
product decisions rather than defects, and this item carries them.

**One.** The tenant provisioning seed ships a two-step leave chain — sequence 1
`LINE_MANAGER`, sequence 2 `ROLE(hr)` — that a newly provisioned tenant satisfies
neither half of. Leave is therefore blocked on day one for every customer, by
default rather than by misconfiguration, until an administrator has both built a
reporting hierarchy out of activated user accounts and populated the `hr` role.
The fix above means they are now told exactly that, which is a large improvement
over a bare 400 and is still not the same as it working.

**Two.** The Approval Matrices screen shows an administrator a chain without
indicating that a rule cannot currently bind. The failure surfaces to the
*employee* who tries to book leave, at the moment they try, rather than to the
person who can actually fix it, at the moment they are looking at the
configuration.

## Why It Matters

Every new tenant hits this. The cost is not a support ticket per customer — it is
that leave, one of the journeys the product is bought for, does not work on the
day the customer first opens it, and the person who discovers this is an employee
rather than an administrator.

There is a real argument for the current seed: a chain that routes to the line
manager and then HR is what most customers want, and seeding nothing would mean
every tenant configures approvals from scratch before leave works at all. That is
why this is a product decision and not a bug. The question is which of the two
bad first days is less bad.

## Evidence

- The three-row probe table in [[BUG-1968]], run against the production demo
  tenant on 2026-08-29.
- `ApprovalMatrixResolverService.resolveApprovalRoute`
  (`services/api/src/modules/approvals/approval-matrix-resolver.service.ts`) —
  the loop that requires every matched step to bind, and now collects and
  explains the ones that do not.
- The seeded chain itself, in the tenant provisioning seed.

## Proposed Approach

Three options, to be decided rather than inferred:

1. **Seed a chain a new tenant can satisfy** — for example a single step routing
   to a tenant-admin role that provisioning is guaranteed to populate, leaving
   the line-manager chain as a template the administrator activates.
2. **Seed nothing**, and let leave route to a default approver until approvals
   are configured. Simplest to reason about; loses the guidance the current seed
   provides.
3. **Keep the seed and warn at configuration time** — the Approval Matrices
   screen resolves each rule against current data and flags the ones that cannot
   bind, with the same remedy text the runtime refusal now uses.

Option 3 is the smallest change to intent and the largest to build, and it is
compatible with either of the first two. The remedy strings already exist in one
place (`remediation()` in the resolver) and would need to be exposed through an
endpoint rather than duplicated in the frontend — duplicating them would be the
second-source-of-truth defect `AGENTS.md` prohibits.

## Acceptance Criteria

- A decision is recorded as an ADR naming which of the three options is taken,
  and why.
- If the seed changes: a freshly provisioned tenant can submit a leave request
  with no manual configuration, covered by a test that provisions and submits.
- If configuration-time warning is built: the Approval Matrices screen shows,
  per rule, whether it can currently bind, using the resolver's remedy text
  rather than its own copy of it.

## Dependencies

None. [[BUG-1968]] is fixed and this is the remainder of its scope, not a
prerequisite for it.

## Related Items

[[BUG-1968]] is the defect this was split from. [[BUG-1969]] (an invited
approver is rejected with a message blaming tenancy) and [[ITEM-0106]] (an
employee is blocked until their manager activates their own account) are the
onboarding consequences of the same resolution policy and should be decided in
the same pass. [[BUG-1966]] is why the employee currently sees nothing at all
when the refusal fires through the UI.

## History

- 2026-08-29 — created at `a86362cf`, splitting the product-decision half of
  [[BUG-1968]] out of the defect half so the fix could land without deciding the
  seed question.
- 2026-08-29 — triaged by the Architect: PRODUCT_DECISION. It is not a defect to schedule; it is a choice between three defensible seeds, and the fix it was split from is already in. Batched with the other decisions awaiting the repository owner.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-1968]]
- Modules — [[database-architecture]], [[approvals]], [[tenant-application]]

<!-- GRAPH:END -->
