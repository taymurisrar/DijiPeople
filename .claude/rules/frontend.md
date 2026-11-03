---
paths:
  - "apps/web/**"
  - "apps/admin/**"
---

# Frontend rules (nested AGENTS.md is authoritative)

- Shared components first; loading/error/empty states; accessible, responsive; no helper copy without asking.
- UI permission gating is cosmetic; the API enforces. A new web import needs `next build`.

Policy ids and enforcement: `docs/engineering/policy-catalogue.json`.
