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
| [SESSION-0101](../../docs/sessions/SESSION-0101-review-and-file-eight-ui-ux-and-settings-findings-from-demo-.md) | — | Review and file eight UI/UX and settings findings from demo walkthrough | ACTIVE | `agent/ux-findings-audit` | `develop` | — | 2026-09-11T23:28:39.815Z |
| [SESSION-0099](../../docs/sessions/SESSION-0099-review-tenant-subscription-plans-features-screen.md) | — | Review tenant subscription Plans & Features screen | ACTIVE | `agent/review-subscription-plans-screen` | `develop` | — | 2026-09-11T20:30:13.810Z |
