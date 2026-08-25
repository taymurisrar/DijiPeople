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
| [SESSION-0058](../../docs/sessions/SESSION-0058-dlp-investigator-review-on-the-employee-form.md) | — | DLP investigator review on the employee form | ACTIVE | `agent/dlp-employee-review` | `develop` | — | 2026-08-25T23:28:07.299Z |
| [SESSION-0057](../../docs/sessions/SESSION-0057-fix-the-six-landing-qa-bugs-run-ui-ux-review-unblock-provisi.md) | — | Fix the six landing QA bugs, run UI/UX review, unblock provisioning and prod checkout, release to main | ACTIVE | `agent/landing-qa-fixes` | `develop` | — | 2026-08-25T19:18:33.032Z |
