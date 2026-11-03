---
name: dp-ci-doctor
description: Diagnose a failing CI run or CI trend and propose durable prevention. Use when CI is red.
---

Lead agent: `dp-ci-reliability-engineer` (`.claude/agents/dp-ci-reliability-engineer.md`). Task: $ARGUMENTS

1. `node scripts/ci-doctor.mjs --run <id> --branch <b> --summary` or `--limit 50`.
2. Separate trunk from feature/dependabot failures. Reproduce with `npm run preflight`.
3. Fix the cause at the source; retries only for NETWORK_TRANSIENT / RUNNER_TIMEOUT, once, evidence kept. Never relax a gate.
4. Add a classifier rule + test when a failure is UNCLASSIFIED once understood.
