---
paths:
  - "services/api/**/*.ts"
---

# API rules (see docs/engineering/standards/api-resource-lifecycle.md)

- Classify every controller in `docs/engineering/api-resource-contracts.json`; `node scripts/check-api-completeness.mjs` must pass (API-001..005).
- Guards + both permission decorators; tenantId only from `request.user`; explicit field picks; unknown fields are a 400.
- Sensitive, immutable, historical and financial resources get no DELETE/restore/bulk without an explicit, justified `allow` entry.

Policy ids and enforcement: `docs/engineering/policy-catalogue.json`.
