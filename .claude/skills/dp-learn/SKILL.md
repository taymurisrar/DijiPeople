---
name: dp-learn
description: Turn a defect, failed CI run or review comment into a reviewed lesson. Use after any non-trivial mistake.
---

Lead agent: `dp-knowledge-engineer` (`.claude/agents/dp-knowledge-engineer.md`). Task: $ARGUMENTS

1. `node scripts/lessons.mjs suggest` for recurring clusters; read the underlying records.
2. `node scripts/lessons.mjs new "<title>" --source CI|BUG|REVIEW --ref <id> --proposes rule|skill|validator|agent`; write the mechanism (rootCause), evidence, proposal, and why existing controls missed it.
3. Leave it PROPOSED. A human sets ACCEPTED; the change lands in a reviewed commit; then mark APPLIED with `appliedIn`. `node scripts/lessons.mjs check`.
