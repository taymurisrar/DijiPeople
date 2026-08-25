---
ID: BUG-1364
aliases: [BUG-1364]
Title: A coordinate-leak assertion substring-matches JSON and fails when the clock spells a coordinate
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: TEST_GAP
Source: QA_RUN
DetectedDate: 2026-08-25
DetectedInSha: 1544b31d
AffectedModules: [services/api/test]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-25-landing-fixes-verification.md
RegressionId: REG-258
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-25
UpdatedAt: 2026-08-25
ResolvedAt: 2026-08-25
---

# BUG-1364 — A coordinate-leak assertion substring-matches JSON and fails when the clock spells a coordinate

## Summary

`attendance-operational.e2e-spec.ts` guards a real privacy invariant — GPS
coordinates must not leak through the generic serialisation of an attendance
day — by serialising the payload and asserting the string does not contain
`"25.3"` or `"51.6"`. The payload also carries `lastReconciledAt`, a timestamp
generated at run time. When reconciliation happens at `…:51.6xx`, the serialised
JSON contains the literal `51.6` and the test fails, reporting a coordinate leak
that did not occur.

## Expected Behavior

The test fails when, and only when, a coordinate actually appears in the day
payload. Its result must not depend on what time it runs.

## Actual Behavior

It fails whenever the reconciliation timestamp's seconds-and-milliseconds spell
either planted coordinate. The failure is indistinguishable, at a glance, from a
genuine privacy regression — it names the right test and the right value.

## Reproduction

Deterministic once the mechanism is known:

1. Run the suite with `lastReconciledAt` falling in the second `51`, in the
   first tenth of that second — i.e. any run at `hh:mm:51.6xx`.
2. `expect(serialised).not.toContain('51.6')` fails.

The same holds for `25.3` against a `:25.3xx` timestamp.

Observed unprompted in CI run `32895970738`, on a branch that changed nothing in
attendance.

## Evidence

The failing assertion, at
[`attendance-operational.e2e-spec.ts:540`](../../services/api/test/attendance-operational.e2e-spec.ts#L540):

```ts
const serialised = JSON.stringify(detail);
expect(serialised).not.toContain('25.3');
expect(serialised).not.toContain('51.6');
expect(serialised).not.toContain('latitude');
```

The CI failure:

```
● Attendance operational (e2e) › keeps coordinates out of the reconciled day and its raw payload
    expect(received).not.toContain(expected)
    Expected substring: not "51.6"
```

and the received payload, with the culprit in it — no coordinate anywhere, and
one timestamp:

```json
{ … "reconciliationVersion":1,"lastReconciledAt":"2026-08-25T20:36:51.641Z" … }
```

`…:51.641Z` contains `51.6`. Every other timestamp in the payload
(`firstCheckInAt`, `lastCheckOutAt`, `startedAt`, `endedAt`) is fixed by the
fixture; `lastReconciledAt` is the only clock-dependent one, which is why the
collision is occasional rather than constant.

Failure rate is roughly **1 run in 300** — two colliding values, each matching
one second in sixty and one tenth within it. Rare enough to be re-run and
forgotten, frequent enough to block a merge eventually.

## Root Cause

A structural assertion was implemented as a substring scan. `JSON.stringify`
flattens a typed object into text, and the text contains far more than the
fields the assertion is about: timestamps, uuids, generated names. A decimal
coordinate is not a distinctive enough string to search a whole serialised
payload for.

The intent was sound. The encoding of the intent lost the type information that
made it checkable.

## Impact

No production impact — this is test-only. The cost is in trust and time: a
red build that names a privacy leak, on a branch touching nothing related to
attendance, is exactly the failure most likely to be dismissed as flake. And a
flaky test that *has* been dismissed once stops being evidence about anything,
including the real leak it was written to catch.

Found because it blocked the landing-fixes merge. It is pre-existing and
unrelated to that work.

## Affected Areas

- `services/api/test/attendance-operational.e2e-spec.ts` — the `keeps
  coordinates out of the reconciled day and its raw payload` case.
- The `Database e2e` CI job, which it can fail at random.

## Proposed Resolution

Assert over the parsed structure rather than the serialised string: walk the
object, collect keys and numeric values, and check that no key names a
coordinate field and no number equals a planted coordinate. Deterministic, and
strictly stronger — it catches a coordinate nested at any depth, and one stored
under a renamed key, neither of which the substring scan could see.

## Acceptance Criteria

- The test passes on a clean payload regardless of the time it runs, including
  a `lastReconciledAt` of `…:51.6xx`.
- It fails on a coordinate at the top level, nested inside an array, and under a
  key not named `latitude`.
- No assertion in it depends on `JSON.stringify` output.

## Regression Coverage

`REG-258`. The rewritten assertion is itself the coverage; its walker was
exercised against four payloads — clean-with-colliding-timestamp, top-level
leak, deeply nested leak, and values-under-renamed-keys — before the change was
believed.

## Dependencies

None.

## Related Items

- [[BUG-1208]] — the sibling shape: a check whose result depends on the
  environment rather than the code under test.

## Resolution

Fixed. The assertion now walks the parsed `detail` object and asserts two
things: no key matches `/latitude|longitude|accuracy|coordinate/i`, and no
numeric value equals `25.3` or `51.6`. `JSON.stringify` is gone from the test.

The replacement is stronger than what it replaces. The old version could only
see a coordinate that survived serialisation as one of two exact decimal
strings; the new one finds a coordinate at any depth, inside arrays, and under
a key that does not advertise itself — the `values only` case, which the old
key check would have missed entirely.

## QA Retest

Verified in `docs/qa/runs/2026-08-25-landing-fixes-verification.md`. The walker
was checked against four payloads before the change was trusted:

| Payload | Expected | Result |
|---|---|---|
| Clean, with `lastReconciledAt: …20:36:51.641Z` — the exact CI failure | pass | pass |
| `{latitude: 25.3, longitude: 51.6}` | caught | caught |
| Coordinates nested in `sessions[].evidence.position` | caught | caught |
| `{lat: 25.3, lng: 51.6}` — renamed keys | caught | caught |

The fourth case is the one the previous assertion could not do.

## History

- 2026-08-25 — found in CI run `32895970738` while merging unrelated landing
  fixes; the branch changed nothing in attendance. Fixed and closed the same
  day.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-258 (see the regression register)

<!-- GRAPH:END -->
