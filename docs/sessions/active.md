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
| [SESSION-0044](../../docs/sessions/SESSION-0044-landing-site-full-e2e-ui-forms-checkout-payments-provisionin.md) | — | Landing site full E2E: UI, forms, checkout, payments, provisioning, performance — local and production | ACTIVE | `agent/landing-e2e-go-live` | `develop` | — | 2026-08-23T00:33:25.629Z |
| [SESSION-0023](../../docs/sessions/SESSION-0023-first-production-release.md) | — | First production release | ACTIVE | `agent/first-production-release` | `main` | — | 2026-08-20T16:21:59.286Z |
| [SESSION-0022](../../docs/sessions/SESSION-0022-go-live-readiness.md) | TASK-0010 | Go-live readiness | ACTIVE | `agent/go-live-readiness` | `develop` | — | 2026-08-20T11:10:18.564Z |
| [SESSION-0019](../../docs/sessions/SESSION-0019-ci-browser-install-latency-and-database-e2e-fixture-contract.md) | — | CI browser install latency and database e2e fixture contract | ACTIVE | `agent/ci-e2e-remediation` | `develop` | — | 2026-08-19T20:24:28.476Z |
| [SESSION-0016](../../docs/sessions/SESSION-0016-database-agent-security-agent-agent-reliability-and-obsidian.md) | — | Database Agent, Security Agent, agent reliability and Obsidian ownership | ACTIVE | `agent/agent-framework-hardening` | `develop` | — | 2026-08-18T20:06:16.992Z |
| [SESSION-0014](../../docs/sessions/SESSION-0014-ci-performance-cancellation-rca-and-autonomous-ci-adaptation.md) | — | CI performance, cancellation RCA and autonomous CI adaptation | ACTIVE | `agent/ci-performance-adaptation` | `develop` | — | 2026-08-18T19:15:42.554Z |
| [SESSION-0003](../../docs/sessions/SESSION-0003-dijipeople-global-technical-remediation.md) | TASK-0005 | DijiPeople Global Technical Remediation | ACTIVE | `agent/remediation-authorization` | `develop` | permissions, record-indexes | 2026-08-17T14:12:24.722+03:00 |
