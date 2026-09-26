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
| [SESSION-0108](../../docs/sessions/SESSION-0108-multi-provider-billing-safepay-for-pkr-alongside-stripe.md) | — | Multi-provider billing: Safepay for PKR alongside Stripe | ACTIVE | `agent/billing-safepay-provider` | `develop` | schema | 2026-09-26T14:30:00.000Z |
