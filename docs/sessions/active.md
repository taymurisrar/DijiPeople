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
| [SESSION-0103](../../docs/sessions/SESSION-0103-implement-the-34-open-records-from-sessions-0099-0102.md) | TASK-0030 | Implement the 34 open records from sessions 0099-0102 | ACTIVE | `agent/records-0099-0102` | `develop` | permissions, runtime-registries, record-indexes | 2026-09-12T12:38:09.669Z |
| [SESSION-0099](../../docs/sessions/SESSION-0099-review-tenant-subscription-plans-features-screen.md) | — | Review tenant subscription Plans & Features screen | ACTIVE | `agent/review-subscription-plans-screen` | `develop` | — | 2026-09-11T20:30:13.810Z |
