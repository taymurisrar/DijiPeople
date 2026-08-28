---
ID: BUG-1208
aliases: [BUG-1208]
Title: component-index --check fails on every Windows checkout, passes in CI
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: INFRA
Source: ARCHITECT
DetectedDate: 2026-08-25
DetectedInSha: ddb457ff
AffectedModules: [framework]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: QA-INFRA-003
RegressionId: REG-250
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-25
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1208 — component-index --check fails on every Windows checkout, passes in CI

## Summary

`node scripts/generate-component-index.mjs --check` reported the index as
drifted in a fresh worktree where no component had been touched, while the same
check passed in CI on the identical commit.

## Expected Behavior

`--check` fails when the committed index no longer matches what the source
doc-comments produce, and passes otherwise — on any platform, since the thing
being compared is content.

## Actual Behavior

It failed on every fresh Windows checkout regardless of content, and passed on
the CI runner. `diff` reported `1,170c1,170` — every line changed — on a file
nobody had edited.

## Reproduction

1. On Windows, with Git normalising line endings on checkout (the default here;
   `git add` prints "LF will be replaced by CRLF" for these files).
2. Create a fresh worktree at a commit whose component index is current.
3. `node scripts/generate-component-index.mjs --check` → out of date.

## Evidence

Found immediately on the first fresh worktree created after the generator
shipped, at `ddb457ff`:

```
.agent/context/component-index.md is out of date.
Run: node scripts/generate-component-index.mjs

$ diff before.md .agent/context/component-index.md
1,170c1,170       <- every line, on an untouched file
```

The CI job "Check component index is current" passed on the same commit, in the
run that authorised the merge.

## Root Cause

The generator writes `\n`. Git checks the file out as `\r\n` on Windows. The
`--check` comparison was a byte comparison of the freshly generated string
against the on-disk file, so the two disagreed on every line.

CI runs on `ubuntu-latest`, which checks out `\n`, so the runner never saw it.

## Impact

A check that fails only on developer machines and passes on the runner is worse
than no check. It teaches people to regenerate reflexively and to disbelieve the
signal, so the one time it reports a *real* drift the report is ignored — which
defeats the whole reason the index is generated and verified rather than
written.

MEDIUM rather than HIGH: it is loud, local, and cannot produce a wrong index —
only a wrong verdict about a right one. Nothing merged in a bad state.

## Affected Areas

- `scripts/generate-component-index.mjs` — the `--check` path only
- The "Check component index is current" step in the Framework validation job,
  which was passing for the wrong reason on Linux

## Proposed Resolution

Normalise line endings before comparing. The comparison already strips the two
provenance lines because they change on every commit; newlines are the same
class of difference — a property of the checkout, not of the content.

## Acceptance Criteria

- `--check` passes on a CRLF checkout of a current index.
- `--check` still fails when a source doc-comment actually changes.

## Regression Coverage

REG-250, test file `scripts/index-drift.test.mjs` — 7 cases over the extracted
comparison in `scripts/lib/index-drift.mjs`, wired into the Framework
validation CI job.

Three cases assert that non-differences are ignored — the same content in two
line endings, a changed provenance stamp, and the realistic combination of a
CRLF checkout from an older commit. Four assert the opposite direction, because
normalising too much yields a check that always passes, which is
indistinguishable from having no check while looking like one.

> The first draft of this record said no regression was needed, arguing that a
> test would only restate the fix. `rebuild-backlog.mjs` refused the record —
> `Status FIXED requires RegressionId` — and it was right to. The argument was
> a rationalisation, and the resulting suite caught something the reasoning had
> not: constructing both line endings in memory covers the case on **every**
> platform, including the CI runner that could never have reproduced it.

Mutation-verified: deleting the line-ending normalisation fails 2 cases, and
making the comparison always-equal fails 4. The first attempt at the former
silently failed to apply and left the suite green — it was re-run and confirmed
applied before the result was believed.

## Dependencies

None.

## Related Items

- [[TASK-0022]] — the task that shipped the generator
- [[QA-INFRA-003]] — the scenario that re-runs it
- [[BUG-1203]] — found and fixed on the same branch, and the same class of
  defect: a check whose correctness was argued rather than tested

## Resolution

The comparison moved to `scripts/lib/index-drift.mjs`, which normalises line
endings before stripping the provenance lines. `generate-component-index.mjs`
now calls `indexIsCurrent()` rather than carrying the logic inline.

Extracting it is the part that matters, and is the same remedy [[BUG-1203]]
needed hours earlier on the same branch: the two exclusions belong together —
the stamp and the line endings are both properties of the checkout rather than
of the content — and a comparison nobody can call from a test is a comparison
nobody will check.

Verified on a CRLF checkout: `--check` passes on the unmodified index, and
still exits 1 when a source doc-comment is mutated.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `scripts/index-drift.test.mjs` ran and passed, as part of `node --test scripts/…`.

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Executed 2026-08-25 on a CRLF worktree — pass on a clean tree, fail on a
mutated `module-action-bar.tsx` doc-comment, restored to pass. Both directions.

## History

- 2026-08-25 — found on the first fresh worktree created after the generator
  shipped in [[TASK-0022]]; triaged `FIX_NOW` and fixed the same day on
  `agent/repo-health-task-sha`, which was already open for [[BUG-1203]].

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `scripts/index-drift.test.mjs`

Proven by:

- `node --test scripts/…` — 6 of 6 passing

**What this does not establish.** No screen was opened. A guard that reads
source and asserts a string is weaker evidence than one that runs the code, and
this sweep does not distinguish between them — it establishes that the fix is
still present and its test still passes, which is what separates a real fix from
one that was silently reverted. Behaviour against production remains unverified
here, and a browser QA pass would still be worth having.

Part of a sweep over all 48: every one of the 206 regression test files named in
the register was confirmed to exist, and every suite containing one was run.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-250 (see the regression register)

<!-- GRAPH:END -->
