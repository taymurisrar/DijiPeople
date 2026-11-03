---
id: LESSON-0006
status: PROPOSED
source: CI
ref: run-41472410252
rootCause: process.stdout to a pipe is asynchronous on Linux and synchronous on Windows, so a script that prints a report larger than the 64 KiB pipe buffer and then calls process.exit() loses the tail of its output only on the CI runner
proposes: validator
created: 2026-11-03
---

# LESSON-0006 — Piped stdout is cut at 64 KiB on Linux if the process exits right after the write

## Evidence

validate-framework simulations 26b/61/61b failed on every branch carrying a large bug register and passed locally at the same SHA. backlog-review --json is 165,634 bytes. After awaiting the write before exiting, the step passed on the first Linux run.

## Proposed change

Implemented: backlog-review drains stdout before exit and governance.test.mjs rejects the console.log(JSON.stringify(...)); process.exit(...) pattern outside a reviewed allowlist. Candidate: a shared writeJsonAndExit helper for the eight allowlisted scripts.

## Why this is not already covered

No test runs on a Linux pipe locally; the failure looked like three unrelated framework checks.
