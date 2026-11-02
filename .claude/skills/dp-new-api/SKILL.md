---
name: dp-new-api
description: Add or change an API resource with the right lifecycle, guards, permissions and tests. Use for any new controller or route.
---

Lead agent: `dp-api-engineer` (`.claude/agents/dp-api-engineer.md`). Task: $ARGUMENTS

1. Read `docs/engineering/standards/api-resource-lifecycle.md`; classify the resource and decide which operations apply (do not add unsafe ones to fill a grid).
2. Add the controller entry to `docs/engineering/api-resource-contracts.json` (type, requires, notApplicable with reasons).
3. Implement guards + both permission decorators, tenant-scoped service, DTO validation, audit, spec.
4. `node scripts/check-api-completeness.mjs --inventory`, `npm --workspace api run check-types`, the module's tests. Update the frontend client and its DTO together (unknown fields are a 400).
