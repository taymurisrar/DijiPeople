---
name: dp-test
description: Choose, run and report the right tests for a change, including QA selection. Use before declaring a change verified.
---

Lead agent: `dp-qa-engineer` (`.claude/agents/dp-qa-engineer.md`). Task: $ARGUMENTS

1. `npm run qa:select -- <module>`; run affected jest specs (`DATABASE_URL` dummy needed for a few), gates (`check-api-completeness`, `check-module-completeness`), and typecheck for each touched workspace.
2. Report exactly which commands ran, passed, failed, skipped and why. A pre-existing failure needs evidence it is pre-existing.
