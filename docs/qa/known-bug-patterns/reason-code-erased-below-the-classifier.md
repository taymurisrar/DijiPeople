# Bug Pattern — Reason Code Erased Below the Classifier

## Pattern

A layer produces a structured reason for an outcome. A layer above it is written
to switch on exactly that reason and render something useful. Between them, a
third layer — a generic error filter, a rethrow, a serialisation step — replaces
the reason with a generic one.

The result is the worst of both: the classifier looks correct in review, its
tests pass in isolation, and it never runs. Every outcome collapses into the
fallback branch, which by design is the one that says "something went wrong".

The tell is a **defensive default that is right in general**. Nobody wrote a bug;
somebody wrote a sensible fallback and nobody checked that this case reaches it.

## Why it happens in DijiPeople

Both sides are individually self-consistent, so neither review nor typecheck
catches it. `ErrorCode` is `keyof typeof ERROR_CATALOG`, but the codes travel as
plain strings in an exception payload, so nothing types the relationship between
"codes a module emits" and "codes the catalog knows". The frontend's list of
codes is a separate `as const` array in another workspace. Three declarations of
the same vocabulary, no compiler edge between any two.

`HttpExceptionFilter.mapLegacyCode` ends with `if (statusCode === 400 ||
statusCode === 422) return 'VALIDATION_FAILED'`. That is correct for almost
every 422 in the product. It is wrong for exactly the ones a module took the
trouble to name.

## Example architecture area

**Self-service attendance ([[BUG-2332]]).** `attendance.service.ts` threw
`UnprocessableEntityException` with `{ code, errorCode }` set to the engine's own
reason — `WORK_MODE_DISALLOWS_REMOTE`, `ACCURACY_TOO_LOW` and ten others. None
existed in the error catalog, so `isErrorCode` failed and all twelve arrived in
the browser as `VALIDATION_FAILED`.

`classifyAttendanceFailure` routes an unrecognised code to `unexpected`, which
raises the platform's technical error dialog. So an employee refused for an
ordinary policy reason — "your work arrangement is on-site only" — was shown
`ERROR VALIDATION_FAILED`, a reference id and a **Download log** button.

The file that classifier lives in opens with a comment saying it exists
specifically to stop that dialog appearing for policy outcomes. It was right, and
it had never once been reached.

The same shape appears one layer out in the same feature: the structured evidence
(`fallbackAvailable`, `accuracyMeters`, `requiredAccuracyMeters`) was attached at
the top level of the thrown payload, while the filter forwards only `details` —
so the accuracy sentence and the fallback offer could never render either. And
again on the client ([[BUG-2334]]), where the attendance adapter turns a
discriminated capture failure into `throw new Error(location.message)`, dropping
the reason before the same classifier can see it.

Three instances, one feature, one shape.

## Detection checklist

- Does a module emit named reason codes? Follow one **all the way to the wire**
  and read it in a real response body, not in the throw.
- Does the transport layer have a status-based fallback? Ask which of this
  module's codes reach it.
- Is there a UI switch on those codes with an explicit "unknown" branch? That
  branch firing for every case is invisible — it looks like the feature working.
- Are the codes declared in more than one workspace? Count the declarations;
  each one is a place the vocabulary can drift.
- Does a rethrow narrow a discriminated union to a string?

The strongest signal is a comment explaining why a classifier exists. It means
the symptom already happened once and someone fixed the layer they could see.

## Required regression test

**Derive the list from the source that emits it, never hand-write it.** A
hardcoded list of codes passes on the day the bug ships, because the bug is not
in the list — it is in the gap between two lists.

`services/api/src/common/errors/attendance-reason-codes.spec.ts` (REG-361) scans
the attendance and attendance-engine sources for emitted `reasonCode` literals
and asserts each is registered at 422/warning.

Two properties are not optional:

- **The scan must guard itself.** One assertion checks it found codes at all, so
  a moved file cannot make the suite pass by iterating nothing.
- **Exclusions must be by name, not by shape.** The first version of this test
  excluded ALLOW outcomes with an `_ALLOWED` suffix rule, which silently dropped
  `METHOD_NOT_ALLOWED` — a refusal, and one of the codes the test exists to
  protect. The self-guard caught it immediately by counting six where seven were
  expected.

Related: [[assertion-without-a-check]], [[divergent-duplicate-guard]],
[[silent-degradation]].
