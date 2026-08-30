---
ID: BUG-2332
aliases: [BUG-2332]
Title: Every attendance refusal reaches the browser as VALIDATION_FAILED and raises the technical error dialog
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: f77c0abb
AffectedModules: [services/api/src/common/errors, services/api/src/modules/attendance, apps/web]
OwnerAgent: backend-api
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-361
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2332 — Every attendance refusal reaches the browser as VALIDATION_FAILED and raises the technical error dialog

## Summary

`attendance.service.ts` throws an `UnprocessableEntityException` carrying the
engine's reason code as `{ code, errorCode }` — `WORK_MODE_DISALLOWS_REMOTE`,
`ACCURACY_TOO_LOW`, and ten others. `HttpExceptionFilter.mapLegacyCode` keeps a
code only if `isErrorCode` recognises it, and **none of these codes existed in
the error catalog**, so every one fell through to the filter's
`statusCode === 422 → VALIDATION_FAILED` default.

The damage lands in the browser. `classifyAttendanceFailure` switches on exactly
those codes and deliberately routes an unrecognised code to `unexpected`, which
raises the platform's technical error dialog. So an employee refused for an
ordinary policy reason was shown **"ERROR VALIDATION_FAILED"**, a reference id
and a **"Download log"** button.

That is precisely the defect the header comment on `attendance-outcome.ts` says
it was written to prevent. The classifier was correct and was never reached: the
code it switches on had already been erased one layer below it.

## Expected Behavior

A refused check-in is a business answer, not a defect. The employee sees a
sentence they can act on — "Your work arrangement is on-site only. Please check
in at your work site" — with no reference id, no severity banner and no log
download.

## Actual Behavior

The friendly message is shown *and* the platform's fatal-error dialog opens over
it, reading `ERROR VALIDATION_FAILED / Review the highlighted fields and submit
again`, with a reference id and a Download log button. Nothing on the screen
tells the employee this was an expected policy outcome.

## Reproduction

1. Sign in as an employee whose work arrangement is on-site only.
2. Check in from a position that is not inside a work site geofence.
3. The API answers 422. Read `errorCode` in the response body.

## Evidence

Live production response, captured on 2026-08-30 during a real check-in:

```json
{
  "statusCode": 422,
  "errorCode": "VALIDATION_FAILED",
  "message": "Your work arrangement is on-site only. Please check in at your work site, or ask your manager to record this attendance.",
  "description": "Review the highlighted fields and submit again.",
  "details": {}
}
```

The message is the engine's own, so the throw reached the filter intact — but
`errorCode` is `VALIDATION_FAILED`, not `WORK_MODE_DISALLOWS_REMOTE`, which
`attendance-web-attendance.service.ts` sets on that decision.

Rendered result on screen, same attempt:

```
ERROR VALIDATION_FAILED
Review the highlighted fields and submit again.
REFERENCE ID  client_1788084874645_x5fa3fbuz1
Download log
```

Two further fields are lost in the same step. `extractValidationDetails` returns
`payload.details ?? payload.errors ?? {}`, and the attendance throw puts its
evidence at the **top level** of the payload, so `details` came back `{}`. The
UI therefore never receives `fallbackAvailable`, `workSite`, `accuracyMeters`,
`requiredAccuracyMeters` or `distanceMeters`. Two consequences follow directly:
the accuracy sentence ("1,240 m reported, 100 m required") can never render, and
the "Request Web Attendance" fallback is never offered because
`fallbackAvailable` is always undefined.

`grep -c` for any attendance reason code in `error-catalog.ts` returned `0`.

## Root Cause

The attendance engine and the attendance UI were built against a shared
vocabulary of reason codes, and the error catalog — which is the gate deciding
which codes survive serialisation — was never told about them. The filter's
fallback is correct in general and wrong here: a 422 with an unrecognised code
really is usually a validation failure.

The failure is silent by construction. Nothing type-checks the relationship
between "codes the engine emits" and "codes the catalog knows", so both sides
looked right in isolation.

## Impact

Every self-service attendance refusal, for every tenant, on every surface that
consumes the API contract. The employee is shown a fatal-error dialog for an
expected outcome, which teaches them the product is broken when it is working.
It also pollutes the client error log with rows for non-defects.

## Affected Areas

- `services/api/src/common/errors/error-catalog.ts`
- `services/api/src/common/filters/http-exception.filter.ts` (`mapLegacyCode`)
- `services/api/src/modules/attendance/attendance.service.ts` (the throw)
- `apps/web/lib/attendance/attendance-outcome.ts` (the classifier that is bypassed)

## Proposed Resolution

Register the attendance reason codes in the error catalog, which is what
`AGENTS.md` requires anyway ("do not invent ad-hoc error shapes; add a catalog
entry instead"). The catalog message and description are fallbacks only — the
filter prefers the thrown payload's own message, so the specific, work-site-aware
sentence is preserved.

Carrying the structured evidence (`fallbackAvailable`, the accuracy numbers)
through the filter is a **separate change** and is not done here: it needs the
throw to nest its evidence under `details` and the web reader to look there, and
it touches a filter shared by 67 modules. Tracked as its own item rather than
bundled into this one.

## Acceptance Criteria

- A refused check-in returns its engine reason code as `errorCode`, not
  `VALIDATION_FAILED`.
- The technical error dialog does not open for a policy or location refusal.
- Every reason code the engine emits has a catalog entry, enforced by a test
  derived from the engine source rather than a hand-written list.

## Regression Coverage

`services/api/src/common/errors/attendance-reason-codes.spec.ts` — REG-361.
Scans the attendance and attendance-engine sources for every emitted
`reasonCode` and asserts each is in the catalog at 422/warning. Source-derived
on purpose: a hardcoded list would have passed on the day this bug shipped. It
also guards itself — one test asserts the scan finds codes at all, so the suite
cannot pass by iterating nothing. Mutation-tested: renaming one catalog key
fails two of the four tests.

## Dependencies

None.

## Related Items

- [[BUG-2331]] — the header defect that stopped capture ever succeeding, which
  is why this refusal path was rarely reached.
- [[BUG-2334]] — the same class of mistake on the client: a reason code
  discarded one layer below the classifier.

## Resolution

Fixed on `agent/attendance-location-capture`.

- `services/api/src/common/errors/error-catalog.ts` — new `attendance` category
  and twelve entries at 422/warning, with the full account of the erasure.
- `services/api/src/common/errors/attendance-reason-codes.spec.ts` — the
  source-derived invariant.

`EMPLOYEE_NOT_FOUND` already existed in the catalog and was never affected.
`OPEN_SESSION_EXISTS` and `ALREADY_CHECKED_IN` are named by the UI but not
emitted by the API; the classifier's bare-409 branch already covers those, so no
entry was invented for them.

## QA Retest

Retest after deploy: refuse a check-in for a work-mode reason and confirm the
response carries `WORK_MODE_DISALLOWS_REMOTE` and that the technical dialog does
not appear. 593 API tests across 49 suites pass locally.

## History

- 2026-08-30 — found while verifying the fix for [[BUG-2331]]: with capture
  working, the first real check-in surfaced the refusal path, which had been
  unreachable while capture always failed first.
- 2026-08-30 - released to production in `ec1d58da` (PR #59) and verified live on the deployed build, not only on the branch.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[attendance]], [[tenant-application]]
- Regression — REG-361 (see the regression register)

<!-- GRAPH:END -->
