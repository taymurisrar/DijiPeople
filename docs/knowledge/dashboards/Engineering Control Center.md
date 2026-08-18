# Engineering Control Center

> **Generated file — do not edit by hand.** Rebuild with `node scripts/generate-dashboards.mjs`,
> then publish with `node scripts/sync-obsidian.mjs`. Edits made in the vault are lost on the next sync.

## State

| | |
|---|---|
| Active sessions | **1** |
| Active parent tasks | 2 |
| Active work packages | 2 |
| Blocked work packages | 0 |
| Sessions declaring a schema write | 0 |
| Open CRITICAL | **0** |
| Open HIGH | 5 |
| Awaiting Architect triage | 0 |
| Owner decisions pending | 2 |
| QA coverage gaps | 60 |
| Scenarios blocked by infrastructure | 0 |

## Active Sessions

| Session | Task | Title | Status | Branch | Target | Leases | Schema |
|---|---|---|---|---|---|---|---|
| [[SESSION-0003-dijipeople-global-technical-remediation|SESSION-0003]] | TASK-0005 | DijiPeople Global Technical Remediation | ACTIVE | `agent/remediation-authorization` | `develop` | permissions, record-indexes | NO |

## Active Tasks and Work Packages

| Task | Title | Type | Size | Progress | Current | Ready next | Blocked |
|---|---|---|---|---|---|---|---|
| [[TASK-0005-dijipeople-global-technical-remediation|TASK-0005]] | DijiPeople Global Technical Remediation | BUG | PROGRAM | 3/11 | WP-09 | WP-04, WP-06, WP-07, WP-08, WP-10 | — |
| [[TASK-0007-commercial-platform-completion-transactional-legal-and-lifec|TASK-0007]] | Commercial platform completion — transactional, legal and lifecycle half | FEATURE | PROGRAM | 0/16 | WP-01 | WP-13 | — |

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

## Backlog Health

| | |
|---|---|
| Open total | 29 |
| Blocked | 0 |
| Deferred | 1 |
| Awaiting a product decision | 2 |
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
