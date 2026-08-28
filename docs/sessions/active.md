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
| [SESSION-0066](../../docs/sessions/SESSION-0066-fix-all-open-and-deferred-bugs.md) | — | Fix all open and deferred bugs | ACTIVE | `agent/open-bug-sweep` | `develop` | — | 2026-08-28T10:03:13.370Z |
| [SESSION-0061](../../docs/sessions/SESSION-0061-unblock-the-production-hosts-for-the-mcp-browser.md) | — | Production admin E2E QA and invitation delivery visibility | ACTIVE | `agent/invitation-delivery-visibility` | `develop` | — | 2026-08-26T09:54:37.336Z |
