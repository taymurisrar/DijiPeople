---
ID: BUG-0016
aliases: [BUG-0016]
Title: Partner onboarding review has no state machine
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: STATE_MACHINE
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [services/api/src/modules/partner-experience]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId: REG-298
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-28
ResolvedAt: 2026-08-28
---

# BUG-0016 — Partner onboarding review has no state machine

## Summary

`PartnerExperienceService.reviewOnboarding` looks the application up and writes
the decided status with **no check on the current status**. Any decision is legal
from any state, in either direction.

## Expected Behavior

A compliance/KYC review is a state machine: approve or reject are legal only
from states where something has actually been submitted for review, and an
already-activated partner is not demoted through this endpoint.

## Actual Behavior

Two consequences, both reproduced:

1. An application still in `INVITED`, with `legalName` and `iban` **null** — the
   partner never submitted anything — was **approved**, and the partner was then
   activated. The gate is satisfiable without the information it exists to
   review.
2. An already-`APPROVED` application was flipped to `REJECTED` **after
   activation**, cascading a live `ACTIVE` partner — signed agreement, live
   referral link — to `REJECTED`.

## Reproduction

Scenarios B5.01 and B5.02 in the QA run.

## Evidence

QA run BUG-06. Verified still present at `main` `ad8f77f`:
`partner-experience.service.ts:573-613` reads the application, derives the new
status purely from the `decision` argument, and writes both the application and
the partner in one transaction with no guard on `application.status` or
`partner.status`.

## Root Cause

A review endpoint modelled as a **setter** rather than as a transition. Nothing
in the code names which transitions are legal, so there is nothing to violate.

## Impact

The partner compliance gate can be satisfied without compliance data, and a live
partner can be knocked out of service by a single mis-clicked review.

## Affected Areas

`services/api/src/modules/partner-experience`; the partner lifecycle
(`PartnerStatus`), referral links, and the partner-referred lead funnel.

## Proposed Resolution

**This is a product decision, not an engineering one.** Three questions need a
human answer:

1. Which application states may be approved or rejected — presumably
   `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, but that is the decision.
2. May an `ACTIVE` partner be demoted through this endpoint at all, or must
   deactivation go through the existing governed `partnerTransition` actions?
3. What happens to a live referral link and its in-flight attributed leads if a
   partner is rejected after activation?

QA's recommendation, recorded but not authoritative: require
`SUBMITTED`/`UNDER_REVIEW`/`CHANGES_REQUESTED` to approve or reject, refuse any
decision once the partner is `ACTIVE`, and route deactivation through
`partnerTransition`.

## Acceptance Criteria

To be set once the transition table is decided. At minimum: an application with
no submitted compliance data cannot be approved, and an `ACTIVE` partner is not
reachable by this endpoint.

## Regression Coverage

**None.** Cannot be written before the transition table exists — a test would
encode a guess.

## Dependencies

A product decision. Blocked on a human, not on engineering.

## Related Items

Modules [[partners|Partners]], [[partner-onboarding|Partner Onboarding]].
Requirement [[requirement-partner-onboarding|Partner Onboarding]].
Its review screens are also unreachable —
[[BUG-0019-partner-inquiry-and-onboarding-review-screens-are-unreachable]] —
so the defect is currently hard to trigger through the UI, which is mitigation
by accident and not a fix.

## Resolution

**Already fixed, and the two questions with engineering answers were answered
the way the reviewer would have.** Verified 2026-08-28.

`partner-onboarding.state-machine.ts` exists and `reviewOnboarding` calls
`partnerOnboardingReviewRefusal` before writing any status. Against this
record's three questions:

1. **Which states may be reviewed** — `SUBMITTED`, `UNDER_REVIEW`,
   `CHANGES_REQUESTED`. `APPROVED` and `REJECTED` are absent because they are
   decisions already taken. A `submittedAt` check backs it up, on the reasoning
   that a review is a review *of* something: an application with no submission
   has no validated legal or bank details to approve.

2. **May an `ACTIVE` partner be demoted here** — no. `ACTIVE`, `SUSPENDED`,
   `INACTIVE` and `TERMINATED` are closed to onboarding review, and the refusal
   points the operator at the governed `partnerTransition` actions, which own
   those moves and write a `PartnerTimeline` entry for each. The
   implementation's note puts it well: letting a compliance review reach an
   `ACTIVE` partner "was the two files disagreeing, not a second policy".

3. **Live referral links and in-flight attributed leads on demotion** — still
   open, and deliberately. It is recorded as a product question in the state
   machine's own header. It is also now *narrower* than when this record was
   written: demotion cannot happen through this endpoint at all, so the question
   only arises via `partnerTransition`, which is governed and audited.

Covered by `partner-onboarding.state-machine.spec.ts`, 13 assertions passing.

No change was made on 2026-08-28. The decision confirmed by the repository owner
that day — reviewable from SUBMITTED / UNDER_REVIEW / CHANGES_REQUESTED, and
`ACTIVE` demotion through the governed transitions instead — is what the code
already does.

## QA Retest

Verified by reading the state machine and running its spec.

The residual product question is unchanged and is the thing to pick up next:
what should happen to a live referral link and its in-flight attributed leads if
a partner is demoted after activation. That now belongs to `partnerTransition`
rather than to onboarding review.

## History

- 2026-08-17 — Architect reconciliation: terminal `VERIFIED` status normalized
  to `ArchitectDisposition: DONE`; the existing resolution and QA evidence are
  unchanged.

- 2026-08-15 — found during the commercial onboarding E2E; not fixed there
  because the correct transition table is a product decision.
- 2026-08-15 — re-verified against `main` `ad8f77f` and recorded awaiting a
  product decision.

- 2026-08-15 — Architect triage: the record was filed PRODUCT_DECISION on three questions. Two were already answered elsewhere in the code and merely contradicted here, which makes them technical inconsistencies rather than product choices: `partnerTransition` already declares `reject` illegal from ACTIVE and already owns suspend/deactivate/reactivate, and `submitOnboarding` already validates the required compliance fields against `partner-settings`. Requiring a submission before a review therefore inherits the existing completeness rule instead of inventing one. Fixed to that extent. The genuinely undecided remainder — whether an APPROVED application may be re-opened, and what happens to a live referral link and its in-flight attributed leads on a post-activation demotion — is split out so it is tracked as a decision rather than as an unfixed defect.
- 2026-08-28 - verified already fixed; the implemented rules match the decision confirmed the same day. The referral-link question remains open, on the lifecycle actions rather than here.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0016]]
- Modules — [[partners]]
- Regression — REG-298 (see the regression register)

<!-- GRAPH:END -->
