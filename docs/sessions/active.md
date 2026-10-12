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
| [SESSION-0126](../../docs/sessions/SESSION-0126-agreement-template-55b74891-v3-final-saas-master-agreement-c.md) | — | Agreement template 55b74891 v3: final SaaS master agreement content | ACTIVE | `agent/agreement-template-v3` | `develop` | — | 2026-10-12T19:04:34.256Z |
