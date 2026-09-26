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
| [SESSION-0112](../../docs/sessions/SESSION-0112-item-0207-system-agreement-templates-publish-new-versions-cl.md) | — | ITEM-0207 system agreement templates publish new versions; close ITEM-0208; record ITEM-0210 decision | ACTIVE | `agent/item-0207-template-versions` | `develop` | — | 2026-09-26T18:05:01.097Z |
