# Engineering Control Center

> **Generated file — do not edit by hand.** Rebuild with `node scripts/generate-dashboards.mjs`,
> then publish with `node scripts/sync-obsidian.mjs`. Edits made in the vault are lost on the next sync.

## State

| | |
|---|---|
| Active sessions | **0** |
| Active parent tasks | 4 |
| Active work packages | 4 |
| Blocked work packages | 0 |
| Work packages waiting on the user | 0 |
| Open questions | 0 |
| Sessions declaring a schema write | 0 |
| Open CRITICAL | **4** |
| Open HIGH | 89 |
| Awaiting Architect triage | 0 |
| Owner decisions pending | 7 |
| QA coverage gaps | 161 |
| Scenarios blocked by infrastructure | 0 |

## Backlog health

Whether the outstanding work is *actionable*, as opposed to merely valid.
A record nobody owns, with no acceptance criteria and no next action,
survives every review by being unfalsifiable.

| | |
|---|---|
| Ownerless actionable records | 0 |
| No acceptance criteria | 186 |
| No next action | 186 |
| Aging — 7d / 30d / 90d | 100 / 0 / 0 |
| Architecture and technical debt | 7 |
| Security gaps | 29 |
| Database gaps | 19 |

Ranked next-best actions weigh blast radius rather than severity alone, and
are computed on demand so the reasons travel with the ranking:

```bash
node scripts/backlog-review.mjs        # health detectors and NEXT_BEST_ACTIONS
node scripts/agent-health.mjs          # AGENT_HEALTH_REGRESSIONS
```

## Active Sessions

_No session is currently registered as active._

## Active Tasks and Work Packages

| Task | Title | Type | Size | Progress | Current | Ready next | Blocked |
|---|---|---|---|---|---|---|---|
| [[TASK-0004-autonomous-framework-v2-architect-only-orchestration-multi-s|TASK-0004]] | Autonomous framework v2 — Architect-only orchestration, multi-session safety, develop integration, persistent QA | FRAMEWORK | PROGRAM | 11/11 | — | — | — |
| [[TASK-0007-commercial-platform-completion-transactional-legal-and-lifec|TASK-0007]] | Commercial platform completion — transactional, legal and lifecycle half | FEATURE | PROGRAM | 16/16 | — | — | — |
| [[TASK-0008-self-service-customer-onboarding-tenant-provisioning-domain-|TASK-0008]] | Self-service customer onboarding, tenant provisioning, domain routing and central login | FEATURE | LARGE | 11/11 | — | — | — |
| [[TASK-0028-enterprise-reports-and-analytics-platform|TASK-0028]] | Enterprise Reports and Analytics platform | FEATURE | LARGE | 5/15 | WP-08 | — | — |

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

| ID | Title | Type | Severity | Status | Affected | Architect |
|---|---|---|---|---|---|---|
| [[BUG-3110-a-live-production-database-password-sits-permanently-in-the-|BUG-3110]] | A live production database password sits permanently in the public git history | SECURITY | CRITICAL | OPEN | services/api | FIX_NOW |
| [[BUG-3152-post-users-userid-roles-lets-a-delegated-role-assignment-adm|BUG-3152]] | POST /users/:userId/roles lets a delegated role-assignment admin self-grant GLOBAL_ADMIN | AUTHORIZATION | CRITICAL | FIXED | api:users/users.service.ts, api:users/users.controller.ts | DONE |
| [[BUG-3154-employee-bank-accounts-ibans-cnics-and-tax-identifiers-are-s|BUG-3154]] | Employee bank accounts, IBANs, CNICs and tax identifiers are stored in plaintext beside an unused AES-256-GCM service | DATA_INTEGRITY | CRITICAL | OPEN | api:employees, api:compensation | PLAN_REQUIRED |
| [[BUG-3155-fieldsecurityrule-masking-is-enforced-only-in-the-browser-th|BUG-3155]] | FieldSecurityRule masking is enforced only in the browser; the API sends the unmasked value | AUTHORIZATION | CRITICAL | OPEN | api:employees | FIX_NOW |

## Owner Decisions Pending

Questions where the engineering is understood and the **product answer is**
**not**. No agent may resolve one by implementing a side of it.

- [[ITEM-0131-production-hr-and-payroll-data-has-no-backup-the-database-is|ITEM-0131]] — **Production HR and payroll data has no backup: the database is on the Neon free plan**
- [[BUG-3178-no-malware-scanning-exists-anywhere-the-tenant-setting-that-|BUG-3178]] — **No malware scanning exists anywhere; the tenant setting that claims it does is inert**
- [[BUG-3180-the-render-service-cannot-be-rebuilt-from-the-repository-sev|BUG-3180]] — **The Render service cannot be rebuilt from the repository: seven boot-required env vars are absent from render.yaml**
- [[BUG-3181-single-environment-no-staging-one-neon-branch-one-stripe-acc|BUG-3181]] — **Single environment: no staging, one Neon branch, one Stripe account, one email sender, and demo data in production**
- [[BUG-3182-no-per-tenant-restore-is-possible-restoring-one-tenant-means|BUG-3182]] — **No per-tenant restore is possible: restoring one tenant means rolling back all of them**
- [[BUG-3333-tenant-buyers-choose-their-own-currency-and-the-three-price-|BUG-3333]] — **Tenant buyers choose their own currency and the three price schedules are not equivalent**
- [[ITEM-0132-no-multi-factor-authentication-exists-anywhere-including-for|ITEM-0132]] — **No multi-factor authentication exists anywhere, including for platform super admins**

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
| [[PLAN-022-approvals|approvals]] | API |
| [[PLAN-022-approvals|approvals]] | DATABASE |
| [[PLAN-022-approvals|approvals]] | INTEGRATION |
| [[PLAN-022-approvals|approvals]] | E2E |
| [[PLAN-022-approvals|approvals]] | BROWSER |
| [[PLAN-022-approvals|approvals]] | SECURITY |
| [[PLAN-022-approvals|approvals]] | PERFORMANCE |
| [[PLAN-023-leave|leave]] | API |
| [[PLAN-023-leave|leave]] | DATABASE |
| [[PLAN-023-leave|leave]] | INTEGRATION |
| [[PLAN-023-leave|leave]] | E2E |
| [[PLAN-023-leave|leave]] | BROWSER |
| [[PLAN-023-leave|leave]] | SECURITY |
| [[PLAN-023-leave|leave]] | PERFORMANCE |
| [[PLAN-030-monitoring|monitoring]] | API |
| [[PLAN-030-monitoring|monitoring]] | DATABASE |
| [[PLAN-030-monitoring|monitoring]] | INTEGRATION |
| [[PLAN-030-monitoring|monitoring]] | E2E |
| [[PLAN-030-monitoring|monitoring]] | BROWSER |
| [[PLAN-030-monitoring|monitoring]] | SECURITY |
| [[PLAN-030-monitoring|monitoring]] | PERFORMANCE |
| [[PLAN-031-routing|routing]] | API |
| [[PLAN-031-routing|routing]] | DATABASE |
| [[PLAN-031-routing|routing]] | INTEGRATION |
| [[PLAN-031-routing|routing]] | E2E |
| [[PLAN-031-routing|routing]] | BROWSER |
| [[PLAN-031-routing|routing]] | SECURITY |
| [[PLAN-031-routing|routing]] | PERFORMANCE |
| [[PLAN-034-reports|reports]] | UNIT |
| [[PLAN-034-reports|reports]] | API |
| [[PLAN-034-reports|reports]] | DATABASE |
| [[PLAN-034-reports|reports]] | INTEGRATION |
| [[PLAN-034-reports|reports]] | E2E |
| [[PLAN-034-reports|reports]] | BROWSER |
| [[PLAN-034-reports|reports]] | SECURITY |
| [[PLAN-034-reports|reports]] | PERFORMANCE |
| [[PLAN-038-notifications|notifications]] | UNIT |
| [[PLAN-038-notifications|notifications]] | DATABASE |
| [[PLAN-038-notifications|notifications]] | E2E |
| [[PLAN-038-notifications|notifications]] | BROWSER |
| [[PLAN-038-notifications|notifications]] | SECURITY |
| [[PLAN-039-entitlement-enforcement|entitlement-enforcement]] | API |
| [[PLAN-039-entitlement-enforcement|entitlement-enforcement]] | DATABASE |
| [[PLAN-039-entitlement-enforcement|entitlement-enforcement]] | INTEGRATION |
| [[PLAN-039-entitlement-enforcement|entitlement-enforcement]] | E2E |
| [[PLAN-039-entitlement-enforcement|entitlement-enforcement]] | BROWSER |
| [[PLAN-039-entitlement-enforcement|entitlement-enforcement]] | SECURITY |
| [[PLAN-039-entitlement-enforcement|entitlement-enforcement]] | PERFORMANCE |
| [[PLAN-040-employees|employees]] | UNIT |
| [[PLAN-040-employees|employees]] | DATABASE |
| [[PLAN-040-employees|employees]] | INTEGRATION |
| [[PLAN-040-employees|employees]] | E2E |
| [[PLAN-040-employees|employees]] | BROWSER |
| [[PLAN-040-employees|employees]] | SECURITY |
| [[PLAN-040-employees|employees]] | PERFORMANCE |

## Backlog Health

| | |
|---|---|
| Open total | 186 |
| Blocked | 2 |
| Deferred | 94 |
| Awaiting a product decision | 7 |
| Awaiting Architect triage | 0 |

Every ordinary record carries a disposition.

## Deployment

Deployment state is **not** derivable from Git. A merge is Git state; what is
running is a separate fact with separate evidence, recorded per release under
`docs/deployment/release-history/`.

- [[2026-09-11-production-5a1afa64|Deployment Report — PRODUCTION — 5a1afa64]]
- [[2026-09-09-production-1c04776|Deployment Report — PRODUCTION — 1c04776]]
- [[2026-09-08-production-fe1cd3d|Deployment Report — PRODUCTION — fe1cd3d]]
- [[2026-08-31-production-dae0e37|Deployment Report — PRODUCTION — dae0e37]]
- [[2026-08-31-production-cace6cd|Deployment Report — PRODUCTION — cace6cd]]

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
