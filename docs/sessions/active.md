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
| [SESSION-0117](../../docs/sessions/SESSION-0117-claims-missing-from-the-sidebar-add-claims-my-claims-navigat.md) | — | Claims missing from the sidebar: add Claims / My Claims navigation | ACTIVE | `agent/claims-navigation` | `develop` | — | 2026-09-27T14:35:22.750Z |
