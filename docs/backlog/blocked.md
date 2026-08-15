# Blocked

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Work that cannot proceed until something outside it changes — access, an
external dependency, missing infrastructure, or another record.

**Blocked is not deferred.** A blocked record is wanted now and cannot move;
a deferred one could move and was chosen against. Recording one as the other
loses the difference between a queue and an obstacle.

## Blocked records

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0001](../../docs/backlog/items/ITEM-0001-no-browser-e2e-tooling-exists.md) | No browser E2E tooling exists in any workspace | TEST_GAP | HIGH | P1 | BLOCKED | apps/web, apps/admin, apps/landing | BLOCKED_EXTERNAL |
| [ITEM-0004](../../docs/backlog/items/ITEM-0004-tenant-activation-never-proven-end-to-end.md) | Tenant activation to ACTIVE has never been reached in any test | TEST_GAP | HIGH | P1 | BLOCKED | api:tenant-control-plane | BLOCKED_EXTERNAL |
