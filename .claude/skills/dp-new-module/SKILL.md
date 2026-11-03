---
name: dp-new-module
description: Create or change a custom/business module so it is fully provisioned (forms, views, action bar) through the one authoritative workflow. Use when someone says "add a module".
---

Lead agent: `dp-module-engineer` (`.claude/agents/dp-module-engineer.md`). Task: $ARGUMENTS

1. `node scripts/check-module-completeness.mjs` — know the baseline.
2. Create through `POST /customization/tables` (`CustomizationService.createTable`) — never write `CustomizationTable` directly. A new write site must be registered in `docs/engineering/module-creation-entrypoints.json`.
3. Confirm the plan was provisioned: forms `main, quickCreate, quickView, lookup`, views `all, recent, quickFind, lookup`, action bar. Run `reconcileModuleComponents` on an existing module to back-fill; it creates only and is safe to repeat.
4. Run `module-provisioning*.spec.ts`. Report what the plan deliberately omits (status/owner views, per-module RBAC).
