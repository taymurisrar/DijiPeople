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
| [SESSION-0121](../../docs/sessions/SESSION-0121-dp-platform-remediation-12-workstreams.md) | — | DP platform remediation — 12 workstreams | ACTIVE | `agent/dp-platform-remediation` | `develop` | — | 2026-10-11T08:04:10.067Z |
