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
| [SESSION-0059](../../docs/sessions/SESSION-0059-admin-app-production-e2e-security-and-performance-qa.md) | — | Admin app production E2E, security and performance QA | ACTIVE | `agent/admin-prod-e2e-qa` | `develop` | — | 2026-08-26T02:10:00.000Z |
