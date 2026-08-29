---
ID: BUG-1968
aliases: [BUG-1968]
Title: Leave approval routing rejects the submission unless every rule in the chain resolves to an active approver
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/leave, services/api/src/modules/approvals]
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

# BUG-1968 — Leave approval routing rejects the submission unless every rule in the chain resolves to an active approver

> **Correction, 2026-08-29.** This record originally claimed the approval matrix
> "is not consulted" and that the reporting-manager requirement overrides it.
> **That was wrong**, and it was wrong because the first pass never looked at the
> approval matrices the tenant already had. The tenant carries a *seeded* two-step
> leave chain, so the newly created matrix rule was not the only rule in play: it
> was appended to a chain whose other steps could not resolve. Adding a matrix
> therefore appeared to change nothing, which read as "the matrix is ignored".
> The mechanism below was then established by peeling the seeded chain one rule at
> a time and re-submitting the same request after each change. The severity is
> unchanged; the defect is narrower, more precise, and worse in its consequence
> for a newly provisioned tenant. The superseded text is not preserved verbatim —
> the corrected mechanism replaces it in every section — but the fact that it was
> wrong is recorded here so nobody reads the fix against the original premise.

## Summary

Leave approval routing does consult the approval matrices. The defect is the
resolution policy: **every active matched rule in the chain must resolve to at
least one active approver at the moment of submission, and if any single step
cannot resolve, the entire submission is rejected with a 400.** There is no skip,
no fall-through to the next sequence, and no fallback. Because the shipped seed
gives every tenant a two-step leave chain — sequence 1 `LINE_MANAGER`, sequence 2
`ROLE(hr)` — a freshly provisioned tenant satisfies neither step, and leave
cannot be requested at all until an administrator has both built a reporting
hierarchy out of activated user accounts and populated the `hr` role.

## Expected Behavior

One of three, and which one is a product decision:

- an unresolvable step is skipped and the chain continues; or
- the chain falls through to the next sequence that can resolve; or
- the configuration error is surfaced to the **administrator at configuration
  time** — "this chain cannot route because no active user holds the `hr` role" —
  rather than as a runtime 400 shown to the **employee** who tried to book leave.

In every case, a tenant with at least one resolvable route should be able to
submit a leave request.

## Actual Behavior

The submission fails with the error belonging to the first step that cannot
resolve, regardless of whether other steps in the chain resolve perfectly:

```
POST /api/leave-requests -> 400
"Approval route requires a reporting manager with a linked active user."
```

and, once the `LINE_MANAGER` step is deactivated:

```
POST /api/leave-requests -> 400
"Approval route role has no active users assigned."
```

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29. The Annual Leave type had
`consumesBalance: false` so the balance gate (BUG-1967) was out of the way and
this error could be isolated in a single variable.

The tenant's seeded approval chain, read before changing anything:

```
Leave request to line manager | LEAVE_REQUEST | leaveRequest | seq=1 | LINE_MANAGER | active
Leave request to HR           | LEAVE_REQUEST | leaveRequest | seq=2 | ROLE (hr)    | active
Timesheet to line manager     | TIMESHEET     | timesheet    | seq=1 | LINE_MANAGER | active
```

(The `TIMESHEET` rule matches a different module key and is not involved.)

A `USER` rule naming an active user was added at sequence 1 as the probe:

```
"QA Leave Route (owner)"  id 8cd076e5-139c-4680-b9f2-b808824b7867
moduleKey LEAVE_REQUEST - recordType leaveRequest - sequence 1
approverType USER - approverUserId = <the requester, an ACTIVE user>
approvalMode ANY_ONE - conditions, scope and duration unset
```

The **same** request body was then submitted three times, changing only which
seeded rules were active:

```
POST /api/leave-requests
{"leaveTypeId": <Annual Leave>,
 "startDate": "2026-09-07",
 "endDate":   "2026-09-09",
 "reason":    "<text>"}
```

| # | Chain state | Result |
|---|---|---|
| 1 | seq1 `LINE_MANAGER` active, seq2 `ROLE(hr)` active | **400** `Approval route requires a reporting manager with a linked active user.` |
| 2 | seq1 `LINE_MANAGER` **deactivated**, seq2 `ROLE(hr)` active | **400** `Approval route role has no active users assigned.` |
| 3 | both seeded rules deactivated, only the seq1 `USER` rule left | **201 CREATED**, `status` PENDING, `totalDays` 3 |

**Row 2 is the decisive one.** With `LINE_MANAGER` deactivated, a perfectly
resolvable sequence-1 `USER` rule was present and matched, and the router still
failed — on the *sequence 2* `ROLE` rule. So the policy is not "the first
resolvable rule wins" and it is not "the matrix is ignored". It is "every matched
rule must resolve, or nothing is created".

Restoring the seeded configuration reproduces row 1: PATCH
`596c013b-f6f2-4566-87e9-7d11b9d772c5` and
`c207225d-4a77-4a01-afea-3883094f21b7` back to `isActive: true`.

## Evidence

The three-row table above is the evidence: one request body, three chain states,
three distinct outcomes on the production demo tenant. The two verbatim 400
messages are quoted above; the 201 in row 3 was followed through to completion —
`GET /api/leave-requests/{id}` returned `canCurrentUserApprove: true` with
`pendingStep.approverUserId` set to the matrix-named approver, `POST
/api/leave-requests/{id}/approve` returned 201, and the record moved to
`APPROVED` with `totalDays: 3` (a correct inclusive count for Mon 7 to Wed 9
September). That the approver came from the matrix rule is itself proof the
matrices are read.

No file:line evidence was collected for the resolver. The routing code in
`services/api/src/modules/leave` and the matrix lookup in
`services/api/src/modules/approvals` should both be located before the fix, and
the question "which layer decides that an unresolvable step is fatal" answered
there rather than inferred from the three probes.

## Root Cause

Not established in code. Observably: the router expands the matched approval
matrix rules into steps and requires each step to bind to at least one active
approver before the request is created, treating an unbindable step as a fatal
validation error rather than as a step to skip, defer or re-route.

## Impact

**Leave is dead on arrival for every newly provisioned tenant.** The seeded chain
needs two things a new tenant does not have: employees whose reporting manager
has an *activated* user account, and at least one active user holding the `hr`
role. Until both exist, every leave request 400s. Nothing in the product tells an
administrator that this is the cause — and through the UI the employee sees
nothing at all, because the runtime form swallows the failure (BUG-1966).

It also makes the chain brittle after onboarding: deactivating the last `hr` role
holder, or an employee losing their manager, silently stops leave for everyone
the chain matches, with no warning at the point the configuration changed.

Rated HIGH and unchanged by the correction: a primary journey is blocked in
production, and it is blocked by default rather than by misconfiguration.

## Affected Areas

`services/api/src/modules/leave` (approval route resolution on request creation),
`services/api/src/modules/approvals` (matrix matching and step binding), the
seeded leave approval chain in the tenant provisioning seed, and the Settings >
Approvals & Workflows > Approval Matrices screens, which give an administrator no
indication that a rule cannot currently bind.

## Proposed Resolution

Decide the resolution policy first — it is a product decision, not an
implementation detail — then make the error actionable wherever it still has to
be raised.

- Choose between skip, fall-through and configuration-time validation. A blocking
  runtime error is defensible for a chain where every step is a required control;
  it is not defensible as the default for a chain the product itself seeded.
- Surface unbindable rules in the Approval Matrices screen, at the moment the
  administrator is looking at the configuration.
- If a runtime failure remains possible, the message must name the tenant-level
  cause and the remedy, not the internal requirement.
- Revisit the seed: shipping a chain that no new tenant can satisfy guarantees
  this failure on day one for every customer.

Whether an `INVITED` user may hold an approval step is a decision that must be
made in the same pass; see BUG-1969 and ITEM-0106.

## Acceptance Criteria

- With the seeded chain in place and no reporting manager or `hr` role holder
  configured, a newly provisioned tenant can either submit a leave request, or is
  told at configuration time — before an employee tries — that the chain cannot
  route.
- With sequence 1 resolvable and sequence 2 unresolvable, the chosen policy is
  applied deterministically and is covered by a test that pins it.
- When a submission is refused for a routing reason, the message names the
  missing configuration in the tenant's terms.
- A test reproduces the three-row table above and asserts the intended outcome
  for each row.

## Regression Coverage

None yet. The regression test is the three-row table: one request body, three
chain states. Row 2 is the one that fails today under any policy other than "all
rules must resolve", and is the row that pins whichever policy is chosen.

## Dependencies

None technically. The journey also needs BUG-1961, BUG-1965 and BUG-1967 for an
end-to-end verification through the UI; each was worked around rather than fixed
for the probes above.

## Related Items

BUG-1969 (an invited approver is rejected with a message blaming tenancy) and
ITEM-0106 (an employee is blocked until their manager activates their own
account) are the onboarding consequences of the same resolution policy. BUG-1967
is the previous block on this journey. BUG-1966 is why the employee sees nothing
when this fires through the UI. BUG-1970 (the elevated-role bypass preceding the
self-requester check) remains code-confirmed and live-unverified: the row-3
approval above was self-approval **by configuration**, since the probe rule named
the requester as the approver, and therefore does not prove that bypass.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

**Environment note.** The two seeded matrices
(`596c013b-f6f2-4566-87e9-7d11b9d772c5`,
`c207225d-4a77-4a01-afea-3883094f21b7`) were left **deactivated** on the demo
tenant, with the probe rule `8cd076e5-139c-4680-b9f2-b808824b7867` left active,
so that leave works end to end for demonstrations. Restore the shipped default by
reversing both, and expect leave to stop working on that tenant again until the
hierarchy and the `hr` role are populated.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — **corrected.** The original mechanism ("the matrix is never consulted") was disproved by further live testing. Title, Summary, Actual Behavior, Reproduction, Evidence, Root Cause, Impact, Proposed Resolution, Acceptance Criteria and Regression Coverage all rewritten to the resolution-policy mechanism established by the three-row probe. Severity held at HIGH. The filename slug still reflects the original title; the id is what the indexes key on, and renaming the file would strand the path recorded in the remediation inventory's `current_evidence`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition PLAN_REQUIRED — needs a designed fallback/skip policy and a configuration-time validation story.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0106]]
- Modules — [[approvals]]

<!-- GRAPH:END -->
