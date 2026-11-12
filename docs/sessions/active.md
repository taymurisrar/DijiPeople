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
| [SESSION-0133](../../docs/sessions/SESSION-0133-complete-multi-payment-billing-end-to-end.md) | — | Complete multi-payment billing end-to-end | ACTIVE | `feature/pk-payment-methods-bank-first` | `develop` | — | 2026-11-05T06:52:59.136Z |
| [SESSION-0130](../../docs/sessions/SESSION-0130-starter-go-live-remediation-dp-qa-002-010-011-012-005-and-p2.md) | — | Starter go-live remediation: DP-QA-002/010/011/012/005 and P2/P3 | ACTIVE | `agent/starter-golive-remediation` | `develop` | — | 2026-10-30T19:14:29.947Z |
