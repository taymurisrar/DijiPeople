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
| [SESSION-0054](../../docs/sessions/SESSION-0054-dlp-capture-go-live-readiness-rule-ui-seeds-body-limit-captu.md) | — | DLP capture go-live readiness: rule UI, seeds, body limit, captures view | ACTIVE | `agent/dlp-go-live` | `develop` | — | 2026-08-25T17:01:21.029Z |
