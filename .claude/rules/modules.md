---
paths:
  - "services/api/src/modules/customization/**"
  - "apps/web/lib/runtime/**"
---

# Module framework rules

- One provisioner: `module-provisioning.ts`. New CustomizationTable write sites must be registered (MOD-001).
- Provisioning is transactional, idempotent, create-only; do not plan views the runtime would silently drop.

Policy ids and enforcement: `docs/engineering/policy-catalogue.json`.
