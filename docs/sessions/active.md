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
| [SESSION-0006](../../docs/sessions/SESSION-0006-commercial-platform-final-parent-completion.md) | TASK-0007 | Commercial platform final parent completion | ACTIVE | `agent/commercial-platform-completion` | `develop` | — | 2026-08-17T23:15:57.480Z |
| [SESSION-0003](../../docs/sessions/SESSION-0003-dijipeople-global-technical-remediation.md) | TASK-0005 | DijiPeople Global Technical Remediation | ACTIVE | `agent/remediation-authorization` | `develop` | permissions, record-indexes | 2026-08-17T14:12:24.722+03:00 |
