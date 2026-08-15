---
ID: BUG-0025
aliases: [BUG-0025]
Title: A live partner could be demoted through the generic partner update
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: STATE_MACHINE
Source: REVIEWER
DetectedDate: 2026-08-15
DetectedInSha: b2ba383
AffectedModules: [services/api/src/modules/partners]
OwnerAgent: backend-api
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-015
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
ResolvedAt: 2026-08-15
---

# BUG-0025 — A live partner could be demoted through the generic partner update

## Summary

`PartnersService.update` guarded the way **into** `ACTIVE` and not the way out
of it. A generic `PATCH /partners/:id` carrying `status: REJECTED` or
`TERMINATED` moved a live partner — signed agreement, working referral link —
straight out of service, with no from-set check and no `PartnerTimeline` entry
recording who did it or why.

Found while fixing
[[BUG-0016-partner-onboarding-review-has-no-state-machine]]: the same defect
shape in the neighbouring writer. BUG-0016 was the compliance-review endpoint
bypassing the declared partner state machine; this is the CRUD endpoint doing
the same thing.

## Expected Behavior

A live partner's status changes through the governed lifecycle actions —
`suspend`, `deactivate`, `reactivate` — which check the from-set in
`partnerTransition` and write a timeline entry carrying the reason.

## Actual Behavior

`update()` contained exactly one status guard, and it faced one way:

```ts
if (dto.status === PartnerStatus.ACTIVE && existing.status !== PartnerStatus.ACTIVE)
  throw new BadRequestException('Activate partners through the governed activation action …');
```

Entering `ACTIVE` was governed. Leaving it was not.

## Reproduction

`PATCH /partners/{id}` with `{ "status": "REJECTED" }` against a partner whose
current status is `ACTIVE`. Before the fix the update succeeded and no timeline
entry was written.

## Evidence

`services/api/src/modules/partners/partners.service.ts` — `update()` at the
baseline carried only the into-`ACTIVE` guard, while `partnerTransition` in the
same file already declared `reject` legal only from `INQUIRY`, `NEW_INQUIRY`,
`UNDER_REVIEW`, `MORE_INFORMATION_REQUIRED` and `APPROVED_AWAITING_AGREEMENT` —
`ACTIVE` deliberately absent — and already owned `suspend` and `deactivate` as
the routes out of `ACTIVE`.

The two statements were in the same file, and the CRUD path did not consult the
one that declared the rule.

## Root Cause

The same shape as BUG-0016: a **setter** standing beside a state machine, with
nothing making the setter defer to it. The asymmetry is the tell — somebody
noticed activation needed governing and guarded that direction only.

## Impact

A live partner could be taken out of service by an ordinary record edit, losing
the audit trail that makes the action reviewable. Lower severity than BUG-0016
because this path is an admin CRUD form rather than the compliance review, and
because the partner's referral link and attributed leads survive the status
change — but the governance gap is identical.

## Affected Areas

`services/api/src/modules/partners` — `update()`, and the partner lifecycle
actions it should defer to.

## Resolution

`update()` now refuses any status change that moves a partner **out of**
`ACTIVE`, mirroring the guard that already refused moves **into** it, and names
the governed actions in the refusal so it is actionable rather than merely
obstructive.

Deliberately narrow: it does **not** route every status transition through
`partnerTransition`. Early-stage moves such as `DRAFT` → `INQUIRY` have no
action in that table and are legitimate record edits; refusing them would break
ordinary work in the name of governance, and a guard that breaks ordinary work
gets reverted.

## Regression Coverage

`REG-015` — `services/api/src/modules/partners/partner-lifecycle-guards.spec.ts`
asserts both directions, so removing either one fails.

## Dependencies

None.

## Related Items

[[BUG-0016-partner-onboarding-review-has-no-state-machine]] — the same defect
shape in the review endpoint, fixed in the same task.
Modules [[partners|Partners]].

## QA Retest

Unit-level. The generic update path has no browser coverage — the partner
surfaces that would exercise it are themselves partly unreachable
([[BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable]]).

## History

- 2026-08-15 — found by the Reviewer while fixing BUG-0016, as the adjacent
  writer with the same defect shape. Fixed in the same task, because closing one
  bypass of the partner state machine while an identical one stayed open two
  functions away would have been a fix in name only.
