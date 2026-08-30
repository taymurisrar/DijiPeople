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
| [SESSION-0085](../../docs/sessions/SESSION-0085-duplicate-customer-on-self-service-checkout-the-wizard-s-dra.md) | — | Duplicate customer on self-service checkout: the wizard's draft id is dropped | ACTIVE | `agent/checkout-duplicate-customer` | `develop` | — | 2026-08-30T19:25:21.859Z |
| [SESSION-0084](../../docs/sessions/SESSION-0084-attendance-correction-request-entry-point-and-web-auth-valid.md) | — | Attendance correction request entry point, and web auth validation | ACTIVE | `agent/attendance-correction-entry` | `develop` | — | 2026-08-30T18:30:09.569Z |
| [SESSION-0061](../../docs/sessions/SESSION-0061-unblock-the-production-hosts-for-the-mcp-browser.md) | — | Production admin E2E QA and invitation delivery visibility | ACTIVE | `agent/invitation-delivery-visibility` | `develop` | — | 2026-08-26T09:54:37.336Z |
