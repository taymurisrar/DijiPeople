# Deferred

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-backlog.mjs`.

Deliberately not now, with a reason. Deferring is a legitimate disposition —
silently dropping is not.

A `CRITICAL` record may never appear here: the Architect must choose `FIX_NOW`
or `BLOCKED_EXTERNAL` with an explicit reason. See
[`.agent/agents/architect.md`](../../.agent/agents/architect.md).

## Deferred records

| ID | Title | Type | Severity | Priority | Status | Affected | Architect |
|---|---|---|---|---|---|---|---|
| [ITEM-0009](../../docs/backlog/items/ITEM-0009-no-observability-platform-exists.md) | No observability platform exists, so a release cannot be verified from outside | INFRA | MEDIUM | P2 | DEFERRED | services/api, apps/web, apps/admin | DEFER |
| [BUG-0018](../../docs/bugs/BUG-0018-bulk-lead-delete-is-unreachable-for-every-role.md) | Bulk lead delete is unreachable for every role, including SUPER_ADMIN | AUTHORIZATION | LOW | P3 | DEFERRED | api:platform-auth, api:super-admin | DEFER |
