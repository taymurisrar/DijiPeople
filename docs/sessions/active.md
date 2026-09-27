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
| [SESSION-0116](../../docs/sessions/SESSION-0116-custom-fields-screens-for-api-only-modules-sort-filter-by-cu.md) | — | Custom fields: screens for API-only modules, sort/filter by custom fields, BUG-3800, live QA | ACTIVE | `agent/custom-fields-screens-and-query` | `develop` | — | 2026-09-27T07:38:03.980Z |
