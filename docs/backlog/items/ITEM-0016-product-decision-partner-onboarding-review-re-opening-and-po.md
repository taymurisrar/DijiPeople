---
ID: ITEM-0016
aliases: [ITEM-0016]
Title: Product decision — partner review re-opening and post-activation demotion
Type: PRODUCT_DECISION
Status: PRODUCT_DECISION
Priority: P2
Severity: MEDIUM
AffectedModules: [services/api/src/modules/partner-experience, services/api/src/modules/partners]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug: BUG-0016
RelatedQA: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0016 — Product decision: partner review re-opening and post-activation demotion

## Summary

The half of [[BUG-0016]] that is genuinely a product question rather than an
engineering one, split out so it is tracked as a decision instead of sitting as
an unfixed defect.

BUG-0016 filed **three** questions as product decisions. Two of them turned out
to be already answered elsewhere in the code and merely contradicted by the
review endpoint — which makes them inconsistencies, not choices — and were
fixed:

- **Which application states may be decided.** `submitOnboarding` is the only
  writer of `SUBMITTED`/`submittedAt`, and it already validates the required
  compliance fields against `partner-settings`. Requiring a submission before a
  review inherits that rule rather than inventing one.
- **May a live partner be demoted through this endpoint.** `partnerTransition`
  already declares `reject` illegal from `ACTIVE` and already owns `suspend`,
  `deactivate` and `reactivate`. Letting a review reach an `ACTIVE` partner was
  two files disagreeing.

What is left has no answer anywhere in the code, and guessing one would encode a
policy nobody chose.

## The questions

### 1. May an `APPROVED` application be re-opened for a fresh decision?

The implemented behaviour refuses it: `APPROVED` and `REJECTED` are absent from
`PARTNER_ONBOARDING_REVIEWABLE_STATUSES`, so a decision already taken cannot be
re-taken through this endpoint.

- **Option A — keep it closed.** A compliance decision is final; a partner whose
  circumstances change submits a new application. Cleanest audit story: every
  application has exactly one decision. Cost: no route to correct a review made
  in error, short of a new application.
- **Option B — allow re-opening from `APPROVED` back to `CHANGES_REQUESTED`.**
  Handles the mistaken approval. Cost: an approval becomes provisional, and the
  activation gate — which reads `onboardingApplications[0].status === APPROVED` —
  can now go backwards underneath an already-activated partner, which is the
  same class of problem as the defect just fixed unless activation is also
  guarded.
- **Recommendation: A**, and treat a mistaken approval as a partner-lifecycle
  action (`suspend`) plus a new application. It keeps one decision per
  application and leaves the activation gate monotonic.

### 2. What happens to a live referral link and its in-flight attributed leads
if a partner is demoted after activation?

Not answered anywhere. Today a demotion leaves the referral link row untouched;
`LeadsService` refuses attribution when `link.partner.status !== ACTIVE`, so new
referrals stop, but leads **already attributed** keep pointing at a partner who
is no longer live, and `CustomerAccount.originatingPartnerId` and
`Tenant.originatingPartnerId` keep their snapshots.

- **Option A — freeze, do not rewrite.** Attribution is a historical fact:
  the lead *was* referred by that partner. Commission eligibility becomes a
  separate question answered at payout time. Cost: reports show a suspended
  partner attached to live customers, which needs explaining.
- **Option B — detach in-flight leads on demotion.** Cleaner reporting. Cost:
  destroys a commercial fact, and a reactivated partner cannot get its pipeline
  back. This is the destructive option.
- **Recommendation: A.** It is non-destructive, and Option B cannot be undone.

### 3. Should `required_approving_review_count` on `main` be raised from 0 to 1?

Not a partner question, but the same shape — a policy call this task deliberately
did not make on the owner's behalf. Branch protection is applied and enforced
([[ITEM-0014]]); approvals are set to 0 because the repository has a single
maintainer and GitHub does not permit self-approval, so requiring one would block
every merge. Raise it the moment a second reviewer exists.

## Why It Matters

Question 2 in particular decides what a commercial record means. Leaving it
undecided is safe today only because the safest behaviour — do nothing — is what
the code happens to do. That is an accident, not a decision, and the first
person to "tidy it up" will pick one at random.

## Acceptance Criteria

Each question has a recorded answer, and the answer is expressed in code as a
transition table or a documented invariant — not as a comment.

## Dependencies

A human. Not blocked on engineering: the invariant-safe portion is implemented
and covered by regression tests.

## Related Items

[[BUG-0016]] · [[BUG-0025]] · [[ITEM-0014]] · modules [[partners|Partners]],
[[partner-onboarding|Partner Onboarding]].

## History

- 2026-08-15 — split out of BUG-0016 during autonomous triage, so the two thirds
  of that record that were engineering inconsistencies could be fixed without
  the remaining third holding a HIGH defect open indefinitely.
