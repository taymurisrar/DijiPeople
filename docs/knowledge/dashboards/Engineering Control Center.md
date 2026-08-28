# Engineering Control Center

> **Generated file — do not edit by hand.** Rebuild with `node scripts/generate-dashboards.mjs`,
> then publish with `node scripts/sync-obsidian.mjs`. Edits made in the vault are lost on the next sync.

## State

| | |
|---|---|
| Active sessions | **2** |
| Active parent tasks | 3 |
| Active work packages | 0 |
| Blocked work packages | 0 |
| Work packages waiting on the user | 0 |
| Open questions | 0 |
| Sessions declaring a schema write | 0 |
| Open CRITICAL | **0** |
| Open HIGH | 3 |
| Awaiting Architect triage | 0 |
| Owner decisions pending | 1 |
| QA coverage gaps | 106 |
| Scenarios blocked by infrastructure | 0 |

## Backlog health

Whether the outstanding work is *actionable*, as opposed to merely valid.
A record nobody owns, with no acceptance criteria and no next action,
survives every review by being unfalsifiable.

| | |
|---|---|
| Ownerless actionable records | 0 |
| No acceptance criteria | 22 |
| No next action | 22 |
| Aging — 7d / 30d / 90d | 14 / 0 / 0 |
| Architecture and technical debt | 6 |
| Security gaps | 2 |
| Database gaps | 0 |

Ranked next-best actions weigh blast radius rather than severity alone, and
are computed on demand so the reasons travel with the ranking:

```bash
node scripts/backlog-review.mjs        # health detectors and NEXT_BEST_ACTIONS
node scripts/agent-health.mjs          # AGENT_HEALTH_REGRESSIONS
```

## Active Sessions

| Session | Task | Title | Status | Branch | Target | Leases | Schema |
|---|---|---|---|---|---|---|---|
| [[SESSION-0069-backlog-burndown-verify-the-fixed-decide-the-deferred-close-|SESSION-0069]] | — | Backlog burndown: verify the fixed, decide the deferred, close what is genuinely open | ACTIVE | `agent/backlog-burndown` | `develop` | — | NO |
| [[SESSION-0061-unblock-the-production-hosts-for-the-mcp-browser|SESSION-0061]] | — | Production admin E2E QA and invitation delivery visibility | ACTIVE | `agent/invitation-delivery-visibility` | `develop` | — | NO |

## Active Tasks and Work Packages

| Task | Title | Type | Size | Progress | Current | Ready next | Blocked |
|---|---|---|---|---|---|---|---|
| [[TASK-0004-autonomous-framework-v2-architect-only-orchestration-multi-s|TASK-0004]] | Autonomous framework v2 — Architect-only orchestration, multi-session safety, develop integration, persistent QA | FRAMEWORK | PROGRAM | 11/11 | — | — | — |
| [[TASK-0007-commercial-platform-completion-transactional-legal-and-lifec|TASK-0007]] | Commercial platform completion — transactional, legal and lifecycle half | FEATURE | PROGRAM | 16/16 | — | — | — |
| [[TASK-0008-self-service-customer-onboarding-tenant-provisioning-domain-|TASK-0008]] | Self-service customer onboarding, tenant provisioning, domain routing and central login | FEATURE | LARGE | 11/11 | — | — | — |

## Branch model

```
main        production deployment branch   ← RELEASE / DEPLOY / HOTFIX_PRODUCTION only
  ↑
develop     autonomous integration branch  ← every ordinary task
  ↑
agent/*     isolated implementation branches
```

An ordinary task finishes with `MAIN_CHANGE_STATUS = UNTOUCHED` and
`DEVELOP_SYNC_STATUS = SYNCED`. Branch state is read from the repository
rather than published here, because a note cannot be evidence about a ref:

```bash
node scripts/repo-health.mjs --main-baseline <sha-at-task-start>
```

## Live state is deliberately not in this note

Heartbeats, the write leases held this minute, `DATABASE_WRITER` and the
develop merge queue live in the repository's shared Git directory, not in
Git. They change between one command and the next, so publishing them here
would produce a note that is never current and can never pass a drift check.

```bash
node scripts/session.mjs list                    # sessions, leases, DATABASE_WRITER, queue
node scripts/session.mjs check --paths <paths>   # classify proposed work
node scripts/repo-health.mjs                     # branches, worktrees, integration lock
node scripts/backlog-review.mjs                  # aging, revalidation, duplicates
node scripts/db-preflight.mjs                    # schema, migrations, client, local database
node scripts/sync-obsidian.mjs --verify           # source orphans, graph orphans, links, parity
node scripts/ci-metrics.mjs collect               # CI durations, cancellations, regression triggers
```

What this note carries is the durable half: which sessions and tasks exist,
what they own, and what the backlog and QA systems currently say.

## Open Critical

_None. Nothing open at CRITICAL._

## Owner Decisions Pending

Questions where the engineering is understood and the **product answer is**
**not**. No agent may resolve one by implementing a side of it.

- [[ITEM-0079-activation-does-not-gate-on-a-workspace-having-any-module-en|ITEM-0079]] — **Activation does not gate on a workspace having any module enabled**

## QA Coverage Gaps

A task touching one of these areas on the named dimension pulls closing the
gap into scope — or files a `TEST_GAP` item and says so.

| Area | Dimension |
|---|---|
| [[PLAN-001-authentication|authentication]] | DATABASE |
| [[PLAN-001-authentication|authentication]] | INTEGRATION |
| [[PLAN-001-authentication|authentication]] | BROWSER |
| [[PLAN-002-authorization|authorization]] | API |
| [[PLAN-002-authorization|authorization]] | DATABASE |
| [[PLAN-002-authorization|authorization]] | INTEGRATION |
| [[PLAN-002-authorization|authorization]] | BROWSER |
| [[PLAN-003-tenant-isolation|tenant-isolation]] | API |
| [[PLAN-003-tenant-isolation|tenant-isolation]] | INTEGRATION |
| [[PLAN-003-tenant-isolation|tenant-isolation]] | BROWSER |
| [[PLAN-004-commercial-onboarding|commercial-onboarding]] | UNIT |
| [[PLAN-004-commercial-onboarding|commercial-onboarding]] | DATABASE |
| [[PLAN-004-commercial-onboarding|commercial-onboarding]] | INTEGRATION |
| [[PLAN-004-commercial-onboarding|commercial-onboarding]] | SECURITY |
| [[PLAN-005-lead-management|lead-management]] | DATABASE |
| [[PLAN-005-lead-management|lead-management]] | INTEGRATION |
| [[PLAN-005-lead-management|lead-management]] | E2E |
| [[PLAN-005-lead-management|lead-management]] | BROWSER |
| [[PLAN-006-partner-lifecycle|partner-lifecycle]] | UNIT |
| [[PLAN-006-partner-lifecycle|partner-lifecycle]] | DATABASE |
| [[PLAN-006-partner-lifecycle|partner-lifecycle]] | INTEGRATION |
| [[PLAN-006-partner-lifecycle|partner-lifecycle]] | E2E |
| [[PLAN-006-partner-lifecycle|partner-lifecycle]] | SECURITY |
| [[PLAN-007-tenant-provisioning|tenant-provisioning]] | API |
| [[PLAN-007-tenant-provisioning|tenant-provisioning]] | DATABASE |
| [[PLAN-007-tenant-provisioning|tenant-provisioning]] | INTEGRATION |
| [[PLAN-007-tenant-provisioning|tenant-provisioning]] | BROWSER |
| [[PLAN-007-tenant-provisioning|tenant-provisioning]] | SECURITY |
| [[PLAN-008-agent-desktop|agent-desktop]] | UNIT |
| [[PLAN-008-agent-desktop|agent-desktop]] | API |
| [[PLAN-008-agent-desktop|agent-desktop]] | DATABASE |
| [[PLAN-008-agent-desktop|agent-desktop]] | E2E |
| [[PLAN-009-attendance|attendance]] | API |
| [[PLAN-009-attendance|attendance]] | DATABASE |
| [[PLAN-009-attendance|attendance]] | BROWSER |
| [[PLAN-009-attendance|attendance]] | PERFORMANCE |
| [[PLAN-010-payroll|payroll]] | API |
| [[PLAN-010-payroll|payroll]] | DATABASE |
| [[PLAN-010-payroll|payroll]] | INTEGRATION |
| [[PLAN-010-payroll|payroll]] | E2E |
| [[PLAN-010-payroll|payroll]] | BROWSER |
| [[PLAN-010-payroll|payroll]] | PERFORMANCE |
| [[PLAN-011-runtime-modules|runtime-modules]] | API |
| [[PLAN-011-runtime-modules|runtime-modules]] | DATABASE |
| [[PLAN-011-runtime-modules|runtime-modules]] | INTEGRATION |
| [[PLAN-011-runtime-modules|runtime-modules]] | E2E |
| [[PLAN-011-runtime-modules|runtime-modules]] | BROWSER |
| [[PLAN-012-deployment-release|deployment-release]] | API |
| [[PLAN-012-deployment-release|deployment-release]] | INTEGRATION |
| [[PLAN-012-deployment-release|deployment-release]] | E2E |
| [[PLAN-012-deployment-release|deployment-release]] | BROWSER |
| [[PLAN-012-deployment-release|deployment-release]] | SECURITY |
| [[PLAN-013-landing|landing]] | UNIT |
| [[PLAN-013-landing|landing]] | API |
| [[PLAN-013-landing|landing]] | DATABASE |
| [[PLAN-013-landing|landing]] | INTEGRATION |
| [[PLAN-013-landing|landing]] | E2E |
| [[PLAN-013-landing|landing]] | SECURITY |
| [[PLAN-013-landing|landing]] | PERFORMANCE |
| [[PLAN-014-outbox|outbox]] | UNIT |
| [[PLAN-014-outbox|outbox]] | INTEGRATION |
| [[PLAN-014-outbox|outbox]] | E2E |
| [[PLAN-014-outbox|outbox]] | PERFORMANCE |
| [[PLAN-015-legal|legal]] | UNIT |
| [[PLAN-015-legal|legal]] | API |
| [[PLAN-015-legal|legal]] | E2E |
| [[PLAN-015-legal|legal]] | BROWSER |
| [[PLAN-015-legal|legal]] | SECURITY |
| [[PLAN-016-seat-billing|seat-billing]] | UNIT |
| [[PLAN-016-seat-billing|seat-billing]] | INTEGRATION |
| [[PLAN-016-seat-billing|seat-billing]] | E2E |
| [[PLAN-016-seat-billing|seat-billing]] | SECURITY |
| [[PLAN-016-seat-billing|seat-billing]] | PERFORMANCE |
| [[PLAN-017-subscription-orders|subscription-orders]] | UNIT |
| [[PLAN-017-subscription-orders|subscription-orders]] | API |
| [[PLAN-017-subscription-orders|subscription-orders]] | INTEGRATION |
| [[PLAN-017-subscription-orders|subscription-orders]] | E2E |
| [[PLAN-017-subscription-orders|subscription-orders]] | BROWSER |
| [[PLAN-017-subscription-orders|subscription-orders]] | SECURITY |
| [[PLAN-017-subscription-orders|subscription-orders]] | PERFORMANCE |
| [[PLAN-018-subscription-changes|subscription-changes]] | UNIT |
| [[PLAN-018-subscription-changes|subscription-changes]] | API |
| [[PLAN-018-subscription-changes|subscription-changes]] | INTEGRATION |
| [[PLAN-018-subscription-changes|subscription-changes]] | E2E |
| [[PLAN-018-subscription-changes|subscription-changes]] | BROWSER |
| [[PLAN-018-subscription-changes|subscription-changes]] | SECURITY |
| [[PLAN-018-subscription-changes|subscription-changes]] | PERFORMANCE |
| [[PLAN-019-platform-admin|platform-admin]] | UNIT |
| [[PLAN-019-platform-admin|platform-admin]] | API |
| [[PLAN-019-platform-admin|platform-admin]] | DATABASE |
| [[PLAN-019-platform-admin|platform-admin]] | INTEGRATION |
| [[PLAN-020-billing|billing]] | UNIT |
| [[PLAN-020-billing|billing]] | API |
| [[PLAN-020-billing|billing]] | DATABASE |
| [[PLAN-020-billing|billing]] | INTEGRATION |
| [[PLAN-020-billing|billing]] | E2E |
| [[PLAN-020-billing|billing]] | BROWSER |
| [[PLAN-020-billing|billing]] | SECURITY |
| [[PLAN-020-billing|billing]] | PERFORMANCE |
| [[PLAN-021-settings|settings]] | API |
| [[PLAN-021-settings|settings]] | DATABASE |
| [[PLAN-021-settings|settings]] | INTEGRATION |
| [[PLAN-021-settings|settings]] | E2E |
| [[PLAN-021-settings|settings]] | BROWSER |
| [[PLAN-021-settings|settings]] | SECURITY |
| [[PLAN-021-settings|settings]] | PERFORMANCE |

## Backlog Health

| | |
|---|---|
| Open total | 23 |
| Blocked | 2 |
| Deferred | 26 |
| Awaiting a product decision | 1 |
| Awaiting Architect triage | 0 |

Every ordinary record carries a disposition.

## Deployment

Deployment state is **not** derivable from Git. A merge is Git state; what is
running is a separate fact with separate evidence, recorded per release under
`docs/deployment/release-history/`.

- [[2026-08-25-production-08d7901|Release — production — `08d7901`]]
- [[2026-08-24-production-6ed7a44|Release — production — `6ed7a44`]]
- [[2026-08-24-production-2609275|Release — production — `2609275`]]

## How this is maintained

Regenerate with:

```bash
node scripts/rebuild-sessions.mjs
node scripts/rebuild-tasks.mjs
node scripts/rebuild-backlog.mjs
node scripts/rebuild-qa.mjs
node scripts/generate-dashboards.mjs
node scripts/sync-obsidian.mjs
```

Every number is derived from the records at generation time. Editing this note
in the vault only loses the edit on the next sync — change the record instead.
