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
| [SESSION-0050](../../docs/sessions/SESSION-0050-dlp-capture-for-desktop-agent-clipboard-and-triggered-screen.md) | — | DLP capture for desktop agent: clipboard and triggered screenshots | ACTIVE | `agent/dlp-desktop-agent` | `develop` | — | 2026-08-24T22:06:09.192Z |
