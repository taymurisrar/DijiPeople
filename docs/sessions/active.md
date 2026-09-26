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
| [SESSION-0111](../../docs/sessions/SESSION-0111-release-develop-to-main-item-0215-then-full-release-of-item-.md) | — | Release develop to main: ITEM-0215 then full release of ITEM-0200/0201/0203/0204/0206 | ACTIVE | `agent/item-0215-and-release` | `main` | — | 2026-09-26T16:31:52.473Z |
