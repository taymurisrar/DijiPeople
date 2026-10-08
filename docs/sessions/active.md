# Active Sessions

> **Generated file — do not edit by hand.** Rebuild with `node scripts/rebuild-sessions.mjs`.

What is running **now**. The Architect reads this before planning, so that
two sessions do not plan work over the same ground.

This file is durable state committed to Git. The *live* view — heartbeats,
leases actually held this minute, the develop merge queue — comes from
`node scripts/session.mjs list`, which reads the shared Git directory and
therefore sees sibling worktrees without anybody having pushed.

| Session | Task | Title | Status | Branch | Target | Leases | Heartbeat |
|---|---|---|---|---|---|---|---|
| [SESSION-0120](../../docs/sessions/SESSION-0120-platform-admin-ux-functional-cleanup-dashboard-header-record.md) | — | Platform Admin UX/functional cleanup: dashboard header, record header, command bar, fields, location cascade, agreement editor, datatable flicker, tenants grid, monitoring | ACTIVE | `agent/admin-ux-cleanup` | `develop` | — | 2026-10-08T21:29:10.881Z |
