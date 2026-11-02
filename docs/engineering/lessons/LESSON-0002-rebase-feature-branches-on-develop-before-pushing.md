---
id: LESSON-0002
status: PROPOSED
source: CI
ref: run-41472410252
rootCause: a feature branch that falls many commits behind develop misses generated-index regenerations and advisory fixes, so framework simulations and the advisory gate fail for reasons unrelated to the branch's own change
proposes: validator
created: 2026-11-02
---

# LESSON-0002 — Rebase feature branches on develop before pushing

## Evidence

`agent/starter-golive-qa`: 18 failed runs, 0 successes; run 41472410252 failed framework simulations 26b/61/61b and the advisory check, all passing on `develop`.

## Proposed change

`preflight` branch-staleness check (implemented, threshold 25 commits). Consider a CI annotation when a PR is >25 behind.

## Why this is not already covered

Nothing warned before the push; CI reported symptoms in four unrelated jobs.
