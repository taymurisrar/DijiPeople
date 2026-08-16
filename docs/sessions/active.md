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
| [SESSION-0001](../../docs/sessions/SESSION-0001-autonomous-framework-v2-multi-session-develop-integration-pe.md) | — | Autonomous framework v2 — multi-session, develop integration, persistent QA | ACTIVE | `agent/framework-autonomous-v2` | `develop` | — | 2026-08-16T23:04:29.187Z |
