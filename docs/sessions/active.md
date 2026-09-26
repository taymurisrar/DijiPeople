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
| [SESSION-0109](../../docs/sessions/SESSION-0109-backlog-item-0201-runtime-optimistic-concurrency-item-0200-c.md) | — | Backlog: ITEM-0201 runtime optimistic concurrency, ITEM-0200 contracts and partners API e2e | ACTIVE | `agent/backlog-0201-concurrency` | `develop` | — | 2026-09-26T12:36:53.307Z |
