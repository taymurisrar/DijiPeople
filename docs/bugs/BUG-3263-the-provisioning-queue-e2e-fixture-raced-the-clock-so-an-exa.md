---
ID: BUG-3263
aliases: [BUG-3263]
Title: The provisioning queue e2e fixture raced the clock, so an exact five-minute interval came out 300001ms
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: TEST_GAP
Source: QA_RUN
DetectedDate: 2026-09-11
DetectedInSha: e3b5744e
AffectedModules: [services/api/test]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-410
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
---

# BUG-3263 — The provisioning queue e2e fixture raced the clock, so an exact five-minute interval came out 300001ms

> **Architect triage, 2026-09-11 — `DONE`.** A one-millisecond flake, and worth a
> record anyway: it sits in `Database e2e`, which is a required job, so every
> release is blocked whenever it fires. A flaky gate is worse than a slow one,
> because it teaches people to re-run rather than read.

## Summary

`provisioning-queue.e2e-spec.ts` seeds a completed provisioning run that is meant
to have taken exactly five minutes:

```ts
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
// ...
startedAt: minutesAgo(60 * 48),
completedAt: minutesAgo(60 * 48 - 5),
```

Each call reads `Date.now()` independently. The difference between the two
timestamps is therefore five minutes **plus however far the clock moved between
the two calls**, so `expect(old?.elapsedMs).toBe(5 * 60_000)` compares 300000
against 300001 whenever a millisecond happens to tick.

## Expected Behavior

A fixture that seeds an interval gets exactly that interval, every run. A test
asserting a stored duration must not be able to fail because of when it ran.

## Actual Behavior

```
expect(received).toBe(expected)
Expected: 300000
Received: 300001
```

Intermittent. The same commit's suite had passed locally minutes earlier, and 407
of 408 e2e tests passed in the failing CI run.

## Reproduction

Not reliably reproducible on demand, which is the nature of it — the window is one
scheduler tick between two adjacent statements. CI run `34550081262` caught it;
running the suite locally three times in succession did not.

## Evidence

- CI run `34550081262`, job `Database e2e`:
  `Provisioning queue (DB-backed) › excludes a success older than a day but
  includes it on request`, at `provisioning-queue.e2e-spec.ts:260`.
- The helper at line 59 of the same file, reading `Date.now()` per invocation.
- The file is untouched by SESSION-0098:
  `git diff --name-only origin/develop..HEAD` does not list it. A latent flake
  that surfaced, not a regression.

## Root Cause

A fixture helper that resolves "now" separately for every timestamp it builds.
Harmless for assertions about *absolute* age — "started 90 minutes ago" is still
90 minutes ago to within a millisecond — and unsound for any assertion about the
*difference* between two seeded timestamps, because the two reads straddle an
unknown amount of real time.

The suite contains both kinds, which is why this survived: the other elapsed-time
assertion is `toBeGreaterThan(80 * 60_000)`, and a millisecond of drift cannot
break a lower bound.

## Impact

Blocks releases at random. `Database e2e` is in the `CI required gate` `needs`
list and `main` requires that gate, so a tick of the clock is enough to stop a
promotion. Nothing is wrong with the product, which is the part that wastes the
most time: the failure invites investigation of the provisioning queue, and the
provisioning queue is fine.

## Affected Areas

- `services/api/test/provisioning-queue.e2e-spec.ts` — the fixture helpers

## Proposed Resolution

Capture one instant for the whole fixture and derive every timestamp from it.

## Acceptance Criteria

- Every seeded interval is exact, independent of when the suite runs.
- The stuck-run assertion still compares a seeded `startedAt` against the real
  clock, because a lower bound on a live run is what it is meant to check.
- The full e2e suite passes.

## Regression Coverage

REG-410. The determinism is structural rather than asserted: with a pinned base
instant there is no code path left where the interval can differ, so a test
asserting "300000 equals 300000" would add nothing. What the register entry
carries is the pattern, so the next fixture does not repeat it.

Verified by three consecutive runs of the suite, then the full 38-suite e2e run.

## Dependencies

None.

## Related Items

- [[ITEM-0055]] — the same job's other known weakness, its serial runtime

## Resolution

`BASE_NOW` is captured once and both `minutesAgo` and `minutesAhead` derive from
it. The comment explains why, and notes explicitly that the stuck-run lower bound
is unaffected, so a later reader does not "fix" that one too.

Full e2e suite: 408 tests in 38 suites, all passing locally against a seeded
throwaway database.

## QA Retest

Continuous, through the e2e job.

## History

- 2026-09-11 — surfaced on CI run `34550081262` while validating an unrelated
  change. Pre-existing; the file is not in this session's diff.
- 2026-09-11 — fixed by pinning the fixture's base instant.

## Notes

Finding this cost a second lesson worth recording. Four earlier attempts to
validate this job locally ran single specs. The first full-suite run then reported
66 failures across four suites that CI passes — because the CI job runs
`verify-database`, `seed:demo` and `seed:admin` first, and a bare migrated database
has none of that. A local run that skips a job's setup steps does not tell you what
the job will do; the reproduction is the whole job, including the parts that are
not tests. The database also has to be named with a marker
(`test`/`ci`/`ephemeral`/`scratch`/`tmp`) or `assert-test-database` refuses it,
which is a guard worth keeping and easy to trip over.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-410 (see the regression register)

<!-- GRAPH:END -->
