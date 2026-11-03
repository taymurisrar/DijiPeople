---
name: dp-fix-bug
description: Fix a defect from reproduction to regression test and bug-record closure. Use for any bug.
---

Lead agent: `dp-api-engineer` (`.claude/agents/dp-api-engineer.md`). Task: $ARGUMENTS

1. Measure the record before fixing: its premise may be stale. `node scripts/retrieve-knowledge.mjs <module>`.
2. Reproduce first; write the failing test; fix the cause, not the symptom; guard the seam, not only the ends.
3. FIXED bug record needs a REG and a QA scenario; commit code and record together.
4. If the cause is a repeatable mistake, `node scripts/lessons.mjs new`.
