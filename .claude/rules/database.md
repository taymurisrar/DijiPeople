---
paths:
  - "services/api/prisma/**"
---

# Database rules (nested AGENTS.md is authoritative)

- Never `migrate reset`/`db push` against a shared DB; never edit an applied migration (DB-001, enforced by hook).
- Destructive change = ExecPlan + expand/backfill/contract. New required config row -> seed-config + verify-seed-config.
- Migration timestamps collide across sessions: check develop first.

Policy ids and enforcement: `docs/engineering/policy-catalogue.json`.
