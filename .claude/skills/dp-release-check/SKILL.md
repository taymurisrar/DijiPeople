---
name: dp-release-check
description: Release-readiness check for develop -> main. Read-only; never deploys. Use before the owner promotes a release.
disable-model-invocation: true
---

Lead agent: `dp-release-hotfix-engineer` (`.claude/agents/dp-release-hotfix-engineer.md`). Task: $ARGUMENTS

Run: `npm run repo:health -- --main-baseline <sha>`, `npm run preflight -- --full`, `npm run ci:metrics`, `npm run branch:policy`, `npm run db:preflight`. Report CI status for the exact SHA, migration list since the deployed SHA (expand-only?), pending owner decisions, rollback target. Verdict READY / NOT READY with evidence. Promotion is the owner's act.
