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
| [SESSION-0107](../../docs/sessions/SESSION-0107-backlog-item-0203-individual-party-type-item-0204-platform-p.md) | — | Backlog: ITEM-0203 individual party type, ITEM-0204 platform permission follow-ups, ITEM-0206 dashboard drill-downs | ACTIVE | `agent/backlog-0203-0204-0206` | `develop` | — | 2026-09-26T09:45:46.287Z |
