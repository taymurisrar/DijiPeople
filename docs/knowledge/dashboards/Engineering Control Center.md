# Engineering Control Center

> **Generated file — do not edit by hand.** Rebuild with `node scripts/generate-dashboards.mjs`,
> then publish with `node scripts/sync-obsidian.mjs`. Edits made in the vault are lost on the next sync.

## State

| | |
|---|---|
| Active sessions | **5** |
| Active parent tasks | 5 |
| Active work packages | 1 |
| Blocked work packages | 4 |
| Sessions declaring a schema write | 0 |
| Open CRITICAL | **0** |
| Open HIGH | 12 |
| Awaiting Architect triage | 0 |
| Owner decisions pending | 3 |
| QA coverage gaps | 94 |
| Scenarios blocked by infrastructure | 0 |

## Active Sessions

| Session | Task | Title | Status | Branch | Target | Leases | Schema |
|---|---|---|---|---|---|---|---|
| [[SESSION-0022-go-live-readiness|SESSION-0022]] | TASK-0010 | Go-live readiness | ACTIVE | `agent/go-live-readiness` | `develop` | — | NO |
| [[SESSION-0019-ci-browser-install-latency-and-database-e2e-fixture-contract|SESSION-0019]] | — | CI browser install latency and database e2e fixture contract | ACTIVE | `agent/ci-e2e-remediation` | `develop` | — | NO |
| [[SESSION-0016-database-agent-security-agent-agent-reliability-and-obsidian|SESSION-0016]] | — | Database Agent, Security Agent, agent reliability and Obsidian ownership | ACTIVE | `agent/agent-framework-hardening` | `develop` | — | NO |
| [[SESSION-0014-ci-performance-cancellation-rca-and-autonomous-ci-adaptation|SESSION-0014]] | — | CI performance, cancellation RCA and autonomous CI adaptation | ACTIVE | `agent/ci-performance-adaptation` | `develop` | — | NO |
| [[SESSION-0003-dijipeople-global-technical-remediation|SESSION-0003]] | TASK-0005 | DijiPeople Global Technical Remediation | ACTIVE | `agent/remediation-authorization` | `develop` | permissions, record-indexes | NO |

## Active Tasks and Work Packages

| Task | Title | Type | Size | Progress | Current | Ready next | Blocked |
|---|---|---|---|---|---|---|---|
| [[TASK-0005-dijipeople-global-technical-remediation|TASK-0005]] | DijiPeople Global Technical Remediation | BUG | PROGRAM | 3/11 | WP-09 | WP-04, WP-06, WP-07, WP-08, WP-10 | — |
| [[TASK-0007-commercial-platform-completion-transactional-legal-and-lifec|TASK-0007]] | Commercial platform completion — transactional, legal and lifecycle half | FEATURE | PROGRAM | 15/16 | WP-11 | — | WP-15 |
| [[TASK-0008-self-service-customer-onboarding-tenant-provisioning-domain-|TASK-0008]] | Self-service customer onboarding, tenant provisioning, domain routing and central login | FEATURE | LARGE | 10/11 | WP-06 | — | WP-06 |
| [[TASK-0009-identity-and-multi-tenant-membership|TASK-0009]] | Identity and multi-tenant membership | FEATURE | LARGE | 11/12 | WP-09 | — | WP-09 |
| [[TASK-0010-go-live-readiness|TASK-0010]] | Go-live readiness | FEATURE | MEDIUM | 7/8 | WP-04 | — | WP-04 |

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

- [[ITEM-0032-recompute-productivity-totals-inflated-by-heartbeat-replays|ITEM-0032]] — **Recompute productivity totals inflated by heartbeat replays**
- [[ITEM-0053-publish-privacy-policy-and-terms-for-the-public-landing-site|ITEM-0053]] — **Publish privacy policy and terms for the public landing site**
- [[ITEM-0057-landing-production-env-examples-still-name-the-vercel-and-re|ITEM-0057]] — **Landing production env examples still name the vercel and render hosts, not the dijipeople.com apex**

## QA Coverage Gaps

A task touching one of these areas on the named dimension pulls closing the
gap into scope — or files a `TEST_GAP` item and says so.

| Area | Dimension |
|---|---|
| [[PLAN-001-authentication|authentication]] | DATABASE |
| [[PLAN-001-authentication|authentication]] | INTEGRATION |
| [[PLAN-001-authentication|authentication]] | E2E |
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
| [[PLAN-019-platform-admin|platform-admin]] | E2E |
| [[PLAN-019-platform-admin|platform-admin]] | SECURITY |

## Backlog Health

| | |
|---|---|
| Open total | 38 |
| Blocked | 0 |
| Deferred | 14 |
| Awaiting a product decision | 3 |
| Awaiting Architect triage | 0 |

Every ordinary record carries a disposition.

## Deployment

Deployment state is **not** derivable from Git. A merge is Git state; what is
running is a separate fact with separate evidence, recorded per release under
`docs/deployment/release-history/`.

_No release has been recorded. Nothing has been deployed through the release process._

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
