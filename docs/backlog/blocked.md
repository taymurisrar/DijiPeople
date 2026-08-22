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
| [ITEM-0048](../../docs/backlog/items/ITEM-0048-replace-or-contain-active-win-and-the-xlsx-export-path.md) | Replace or contain active-win and the xlsx export path | SECURITY | HIGH | P2 | BLOCKED | apps/agent-desktop, services/api/src/common/excel, package-lock.json | BLOCKED_EXTERNAL |
