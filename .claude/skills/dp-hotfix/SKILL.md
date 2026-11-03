---
name: dp-hotfix
description: Emergency production fix pipeline up to owner-approved deployment. Use for P0/P1 incidents only.
disable-model-invocation: true
---

Lead agent: `dp-release-hotfix-engineer` (`.claude/agents/dp-release-hotfix-engineer.md`). Task: $ARGUMENTS

Read `docs/engineering/runbooks/hotfix.md` first.
1. `node scripts/hotfix.mjs plan --severity P0|P1 --title "<incident>" --prod-url <health url>` — baseline is the verified deployed SHA.
2. Branch from that baseline; smallest patch; run every gate in the plan (lint, build, authz regression are never skippable).
3. `node scripts/hotfix.mjs dry-run ...` — produces the artifact manifest and rollback; deploys nothing.
4. STOP. Present the plan, evidence and rollback to the owner. Production deployment needs their explicit approval; you cannot grant it.
5. After approval and deploy: verify `/api/health` SHA, smoke, monitoring; backport to develop; close the incident.
