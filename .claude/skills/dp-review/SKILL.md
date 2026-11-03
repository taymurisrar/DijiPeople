---
name: dp-review
description: Review a diff against architecture, security, API, migration and test standards with evidence. Use before merge.
---

Lead agent: `dp-security-reviewer` (`.claude/agents/dp-security-reviewer.md`). Task: $ARGUMENTS

Review dimensions: architecture consistency, correctness, API contract and compatibility, access control and tenant isolation, sensitive-data handling, performance, accessibility, migrations/seeds, test quality, production config.
Run `npm run preflight` and the gates relevant to the paths. Output each finding as severity / file:line / evidence / minimal fix, plus "not checked". Do not approve your own change.
