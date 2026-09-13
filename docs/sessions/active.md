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
| [SESSION-0105](../../docs/sessions/SESSION-0105-demo-walkthrough-2-hierarchy-work-site-customization-notific.md) | — | Demo walkthrough 2 - hierarchy, work site, customization, notifications findings | ACTIVE | `agent/demo-walkthrough-2-records` | `develop` | — | 2026-09-12T23:13:41.157Z |
