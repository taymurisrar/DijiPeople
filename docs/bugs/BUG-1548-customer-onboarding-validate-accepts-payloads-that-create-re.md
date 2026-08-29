---
ID: BUG-1548
aliases: [BUG-1548]
Title: Customer onboarding validate accepts payloads that create rejects
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [onboarding]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-352
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1548 — Customer onboarding validate accepts payloads that create rejects

> **Architect triage, 2026-08-27 — `DEFER`.** Same form as BUG-1545. Fixing that removes the 409 case and isolates the 400.
>
> **Superseded 2026-08-29 — `FIXED`.** The 400 did not need isolating: both it and the 409 come from the same set of checks, and validate ran none of them.


## Summary

The customer onboarding validate endpoint and the create endpoint disagree.
`POST /api/platform-runtime/customer-onboarding/validate` returns 201 for
payloads that `POST /api/platform-runtime/customer-onboarding` then rejects with
400 or 409. A validation step whose approval does not predict the outcome of the
operation it validates is worse than no validation step, because the UI builds
on its answer.

## Expected Behavior

If validate accepts a payload, create accepts the same payload. Where create can
still fail for reasons validate cannot know — a race on a unique constraint, for
instance — that set of reasons is narrow and documented.

## Actual Behavior

Validate returns 201. Create, with the same payload, returns 400 or 409.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open Onboarding and start a new record.
3. Complete the form and trigger the validate call.
4. Observe 201 from `.../customer-onboarding/validate`.
5. Save, and observe 400 or 409 from `.../customer-onboarding`.

## Evidence

Observed on production, 2026-08-26, in the browser network panel. The two calls
were made against the same form state, with validate returning 201 and create
returning an error.

The 409 case overlaps with the foreign key failure recorded as [[BUG-1545]];
the 400 case is separate and remains uncharacterised.

## Root Cause

Not established. Two endpoints applying different rules to the same payload is
the symptom; whether validate omits checks create performs, or the two run
different code paths entirely, has not been confirmed.

## Impact

The form cannot tell the operator whether a save will succeed. Combined with
[[BUG-1546]], which hides which fields are at fault, an operator gets an
approval followed by an unexplained refusal.

It also undermines the value of the validate endpoint for any future caller.

## Affected Areas

- `services/api/src/modules/platform-runtime` — customer onboarding validate and
  create
- `services/api/src/modules/onboarding`
- `apps/admin` — the Onboarding form

## Proposed Resolution

Make validate execute the same rule set as create, ideally by sharing one
validation path rather than maintaining two. Where create must retain checks
validate cannot perform, enumerate them so the divergence is deliberate and
known.

Fixing [[BUG-1545]] first will remove the 409 case and leave the 400 isolated
for diagnosis.

## Acceptance Criteria

- A payload accepted by validate is accepted by create, except for a documented
  and enumerated set of race conditions.
- A payload rejected by create is rejected by validate with the same reason.
- The rejection reason is the same string in both responses.

## Regression Coverage

None yet. Needs a test that drives both endpoints with a shared table of
payloads and asserts their verdicts agree. Requires a `REG-nnn` entry once
written.

## Dependencies

Diagnosis is easier after [[BUG-1545]] is fixed.

## Related Items

Shares the onboarding form with [[BUG-1545]], [[BUG-1546]] and [[BUG-1547]].

## Resolution

**Fixed 2026-08-29.** The premise held. The two endpoints disagreed, and the
disagreement was entirely past the DTO.

### Where the divergence was, and where it was not

It was **not** in the schema. `PlatformRuntimeService.validate` and
`PlatformRuntimeService.create` already ran the same class for this module —
`CreateCustomerOnboardingRecordDto` on both the `create` and `validate`
branches of the same switch. A payload that failed the DTO failed both.

It was everything after the DTO. `create` calls
`SuperAdminService.createCustomerOnboarding`, which goes on through
`PlatformLifecycleService`:

1. `assertCustomerOnboardingSubStatus(status, subStatus)` — 400
2. `getCustomerOrThrow(customerId)` — 404 if the customer does not exist
3. `assertCustomerOwnerAccess(actor, customer)` — 403
4. a non-super-admin supplying `onboardingOwnerUserId` — 400
5. an onboarding already active for that customer — **409**
6. the customer's onboarding prerequisites not met — **400**
7. `createServiceAccount` set without `serviceAccountEmail` — 400
8. `assertValidTenantSlug(plannedTenantSlug)` — 400
9. the planned tenant slug already taken by a tenant — **409**

`validate` ran the DTO, returned `{ success: true }`, and none of the nine.
That is the 400 and the 409 the record reports, and the reason the 400 case
looked "uncharacterised": there was no single 400 to characterise — five of the
nine produce one.

### The fix

One rule set, called by both, as the record asked for.

- `services/api/src/modules/super-admin/platform-lifecycle.service.ts` — checks
  2 through 9 are extracted from `createOnboardingFromCustomer` into
  `assertOnboardingCreatable`, which writes nothing and returns the customer and
  the normalised slug so the create path does not look them up twice.
  `assertCustomerOnboardingCreatable` wraps it with check 1, so the validate
  entry point covers the whole set including the sub-status rule that
  `createCustomerOnboarding` performs before it delegates — a rule the validate
  endpoint skipped counts as a divergence whether it lives one method up or not.
- `services/api/src/modules/super-admin/super-admin.service.ts` — exposes it
  alongside `createCustomerOnboarding`.
- `services/api/src/modules/platform-runtime/platform-runtime.service.ts` —
  `validate` runs it after the DTO for `customer-onboarding` in `create` mode.
  The exceptions are the ones create throws, unchanged in wording and status,
  and `readValidationFailure` renders them into the same
  `{ success, message, errors }` shape the form already reads — so the rejection
  reason is literally the same string on both endpoints rather than a paraphrase.

The create path's behaviour is unchanged: same checks, same order, same
messages, same status codes. Nothing was written to make validate work, and
`assertOnboardingCreatable` performs no write of its own.

### The residual divergence, stated rather than left implicit

The record asks for the set of reasons create can still fail to be narrow and
enumerated. It is two, and both are races: another operator creating an
onboarding for the same customer, or claiming the same tenant slug, between the
validate call and the save. Both are refused a moment later by the same two
checks with the same message, so the operator sees the same sentence either way.

### Tests

`services/api/src/modules/platform-runtime/customer-onboarding-validate-agrees-with-create.spec.ts`
— seven cases driving the real `validate`:

- it runs the create rule set at all;
- a 409 for an already-active onboarding is reported, with create's wording;
- unmet prerequisites are reported rather than approved;
- a taken tenant slug is reported;
- a DTO failure still short-circuits before the business rules, so a malformed
  payload is not reported as a business refusal;
- update-mode validation is left alone, because "an onboarding already exists
  for this customer" would refuse every edit of that onboarding;
- and one structural case: each refusal is written exactly once in the lifecycle
  service, and the create path resolves what it needs from the shared assertion
  rather than repeating the lookups — which is what stops the two paths drifting
  apart again.

### Acceptance criteria

- A payload validate accepts is accepted by create, except for the two races
  enumerated above.
- A payload create rejects is rejected by validate for the same reason.
- The reason is the same string in both responses, because it is the same
  exception thrown from the same line.

## QA Retest

Not retested against production. Covered by unit tests over the real `validate`
path; confirming it on the Onboarding form wants an operator to submit a payload
that trips one of the nine checks and see the reason appear before the save
rather than after it.

BUG-1546, which hides which field is at fault, is untouched here — this makes
the two endpoints agree on the *reason*, not on the field. The refusals raised
by these checks carry a message and no `fieldErrors`, so the form will show the
sentence without highlighting a control. That is the same behaviour create has
always had, and it belongs to BUG-1546 rather than to this record.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.
- 2026-08-29 — fixed in SESSION-0076. Both endpoints already ran the same DTO; the divergence was the nine business checks past it, which validate skipped. They are now one method, `assertCustomerOnboardingCreatable`, that writes nothing and that both endpoints call. Only two race conditions can still make create refuse what validate accepted.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
