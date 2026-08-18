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
| [SESSION-0018](../../docs/sessions/SESSION-0018-self-service-onboarding-provisioning-domain-routing-and-cent.md) | — | Self-service onboarding, provisioning, domain routing and central login | ACTIVE | `agent/self-service-onboarding-provisioning` | `develop` | — | 2026-08-18T23:23:49.309Z |
| [SESSION-0016](../../docs/sessions/SESSION-0016-database-agent-security-agent-agent-reliability-and-obsidian.md) | — | Database Agent, Security Agent, agent reliability and Obsidian ownership | ACTIVE | `agent/agent-framework-hardening` | `develop` | — | 2026-08-18T20:06:16.992Z |
| [SESSION-0014](../../docs/sessions/SESSION-0014-ci-performance-cancellation-rca-and-autonomous-ci-adaptation.md) | — | CI performance, cancellation RCA and autonomous CI adaptation | ACTIVE | `agent/ci-performance-adaptation` | `develop` | — | 2026-08-18T19:15:42.554Z |
| [SESSION-0003](../../docs/sessions/SESSION-0003-dijipeople-global-technical-remediation.md) | TASK-0005 | DijiPeople Global Technical Remediation | ACTIVE | `agent/remediation-authorization` | `develop` | permissions, record-indexes | 2026-08-17T14:12:24.722+03:00 |
