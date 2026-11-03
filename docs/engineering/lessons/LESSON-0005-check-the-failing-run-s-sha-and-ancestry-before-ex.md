---
id: LESSON-0005
status: PROPOSED
source: CI
ref: run-41472410252
rootCause: a plausible cause (stale branch base) was written into the analysis from the failure pattern without checking the failing run's SHA against develop; the SHA was the branch tip, 0 commits behind, so the explanation was wrong and a fix would have been aimed at nothing
proposes: rule
created: 2026-11-02
---

# LESSON-0005 — Check the failing run's SHA and ancestry before explaining a red build

## Evidence

Run 41472410252 failed on 7fe24a7b. `git rev-list --count 7fe24a7b..origin/develop` = 0, and validate-framework passes at that SHA locally (full and --depth 1). The earlier note called it a stale base.

## Proposed change

When classifying a red run, ci-doctor should print the head SHA, its distance from develop and whether the same command passes at that SHA before suggesting a cause. Until then: state hypotheses as hypotheses.

## Why this is not already covered

The classifier matches log text, not the environment of the run.
