---
name: dp-implement-feature
description: End-to-end feature delivery under the DijiPeople lifecycle. Use for any feature request.
---

Lead agent: `dp-solution-architect` (`.claude/agents/dp-solution-architect.md`). Task: $ARGUMENTS

1. `node scripts/session.mjs list` / `check --paths`; work in an `agent/*` worktree, target `develop`.
2. Architect design (dp-solution-architect) -> implement (dp-api-engineer / dp-ui-ux-engineer / dp-module-engineer) -> `npm run preflight` -> independent dp-qa-engineer -> dp-security-reviewer for auth/data changes.
3. Escalate owner-level decisions (AGT-001) instead of choosing.
4. Finish per `.agent/context/task-completion-contract.md`; never write "done" before that is evaluated.
