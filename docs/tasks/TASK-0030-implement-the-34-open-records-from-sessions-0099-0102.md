---
TASK_ID: TASK-0030
aliases: [TASK-0030]
TITLE: Implement the 34 open records from sessions 0099-0102
TYPE: FEATURE
SIZE: LARGE
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-09-12
AFFECTED_MODULES: [apps/web, apps/admin, auth, billing, notifications, customization, employees]
AGENTS: [architect, backend-api, frontend, ui-ux, security, integration, qa, reviewer, integrator]
DEPENDENCIES:
CURRENT_PACKAGE: WP-01
COMPLETED_PACKAGES: []
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 4
FINAL_STATUS:
---

# TASK-0030 — Implement the 34 open records from sessions 0099-0102

## Objective

Sessions [[SESSION-0099]] through [[SESSION-0102]] were review and audit sessions:
they filed 36 durable records and changed no product code. This task implements
them. A reader knows it is finished when every one of the 34 records in scope is
`FIXED` or `DONE` with a filled Resolution section, the two records the Architect
deliberately deferred are still `DEFERRED` with that decision intact, and no
record this task touched sits at `TRIAGE_REQUIRED`.

Two records — [[BUG-3333]] and [[BUG-3350]] — carry a commercial question the
owner answered during this task rather than an engineering one. Their answers are
in Owner Decisions below and are the reason those two are implemented the way
they are.

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Tenant plans and subscription screens | IN_PROGRESS | — | frontend, ui-ux | agent/r-s1-billing-web | — | — | BUG-3330, BUG-3332, BUG-3335, BUG-3336, BUG-3345, ITEM-0159 | — | — |
| WP-02 | Billing price gating and entitlement enforcement | IN_PROGRESS | — | backend-api, security | agent/r-s2-billing-api | — | — | BUG-3334, BUG-3350, BUG-3331, BUG-3333 | — | — |
| WP-03 | Session lifetime, rotation and attribution | IN_PROGRESS | — | security, backend-api, frontend | agent/r-s3-auth | — | — | BUG-3355, BUG-3356, BUG-3357, BUG-3358, BUG-3359, BUG-3360, ITEM-0162 | — | — |
| WP-04 | Web shell theme, customization gate and runtime semantics | IN_PROGRESS | — | ui-ux, frontend | agent/r-s4-webux | — | — | BUG-3373, BUG-3374, BUG-3378, BUG-3412 | — | — |
| WP-05 | Lookup convergence and server-side search | IN_PROGRESS | — | frontend, ui-ux | agent/r-s6-lookups | — | — | BUG-3376, BUG-3377, ITEM-0163 | — | — |
| WP-06 | Notification model ownership, catalog and coverage | IN_PROGRESS | — | backend-api, architecture | agent/r-s7-notifications | — | — | BUG-3375, BUG-3379, ITEM-0168, ITEM-0169, ITEM-0170, ITEM-0171 | — | — |
| WP-07 | Employee record shell and its panels | NOT_STARTED | WP-04 | frontend, ui-ux | agent/r-s8-employee | — | — | ITEM-0164, ITEM-0165, ITEM-0166, ITEM-0167 | — | — |
| WP-08 | Integration, validation and finalization | NOT_STARTED | WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07 | integrator, qa, reviewer | agent/records-0099-0102 | — | — | — | — | — |

WP-07 depends on WP-04 and not merely by convention. [[ITEM-0167]] propagates the
employee record shell to eleven further pages, and [[BUG-3378]] is an
accessibility defect *in that shell*. Migrating first would multiply the defect
by eleven, which is why the record says so explicitly and why the package is
sequenced rather than parallelised.

WP-01 and WP-02 split [[BUG-3331]] and [[BUG-3333]] between them, because each of
those records has a screen half and a server half that cannot be reviewed
together. Neither package closes either record alone.

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | The 34 records describe the code as it stands today, not as it stood when they were written. | All were filed between 2026-09-11 and 2026-09-12, against `caad4a56` and `85c31d9d`; `develop` has moved only by documentation commits since. | HIGH | A stream implements a fix for a defect that no longer exists. Each stream re-measures before changing code. |
| A-02 | No Prisma migration is required by any of the 34 records. | Every Proposed Resolution names a code change; only [[BUG-3359]]'s grace window and [[ITEM-0169]]'s key migration approach schema, and both have a route that avoids it. | MEDIUM | The database is single-writer across all sessions, so a migration serialises the whole task behind one lease. Streams were told to report loudly rather than proceed quietly. |
| A-03 | The six parallel streams touch disjoint file sets, so integration is a merge rather than a reconciliation. | Scopes were drawn on module boundaries: billing screens, billing API, auth, web shell, lookups, notifications. | MEDIUM | Conflicts in `apps/web/app/components/ui/`, where WP-01 adds a segmented control and WP-05 rewrites the lookup. Resolved at integration, by the Integrator, not by either stream. |
| A-04 | Turning entitlement enforcement on affects `develop` only and reaches no live tenant during this task. | Ordinary tasks target `develop`; `MAIN_CHANGE_STATUS` must end `UNTOUCHED`. | HIGH | A live Starter tenant loses Payroll and Recruitment without warning. WP-02 must deliver enforcement as a reversible setting plus a grandfathering script, never a hardcoded flip. |

## Owner Decisions

| ID | QUESTION | ANSWER | DATE |
|---|---|---|---|
| D-01 | [[BUG-3333]] — the PKR schedule implies 136 PKR per USD, roughly half the market rate, so PKR is about a 50% discount chosen from an open dropdown. What should happen to the prices? | Do not touch any price. Implement the engineering half only: scope the offered currency to the tenant's market, and refuse a foreign-market `planPriceId` on the server. The PKR peg stays an open commercial question. | 2026-09-12 |
| D-02 | [[BUG-3350]] — the plan comparison claims module exclusivity that `EntitlementGuard` only reports on. Enforce, or stop claiming? | Turn enforcement on. Delivered as a reversible platform setting with a grandfathering script and an ADR, landing on `develop` only. The owner was told, before answering, that this removes Payroll and Recruitment from a Starter tenant. | 2026-09-12 |
| D-03 | [[BUG-3355]] — a second sign-in silently revokes the first session, because an absent setting row reads as "one session only". What is the default? | Concurrent sessions are allowed by default. An absent setting now means multiple sessions are permitted, and a tenant wanting single-session opts in explicitly. | 2026-09-12 |
| D-04 | Ten records are triaged `PLAN_REQUIRED` and two were deliberately deferred. How far does this task go? | Implement everything including the plan-required work, writing the ExecPlans and implementing against them in the same task. The two deferred items stay deferred. | 2026-09-12 |

## Repository Health

PRE_TASK_REPO_HEALTH = PASS at `b7bd1ca7`. MAIN_SYNC_STATUS = SYNCED,
DEVELOP_SYNC_STATUS = SYNCED, PRIMARY_WORKTREE_STATUS = CLEAN,
UNEXPLAINED_DIRTY_FILES = 0. Main baseline `85c31d9d`.

Two warnings were present before this task started and are not its to fix: three
other worktrees are dirty with other sessions' live work, and `render.yaml`
disagrees with the live Render service on 31 fields.

POST_TASK_REPO_HEALTH — pending.

## History

- 2026-09-12 — created at `f5f43805`.
- 2026-09-12 — four owner decisions taken before planning, recorded above.
- 2026-09-12 — decomposed into eight work packages; six started in parallel.

## Related

[[SESSION-0103]] · [[SESSION-0099]] · [[SESSION-0100]] · [[SESSION-0101]] ·
[[SESSION-0102]]

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-3330]], [[BUG-3331]], [[BUG-3332]], [[BUG-3333]], [[BUG-3334]], [[BUG-3335]], [[BUG-3336]], [[BUG-3345]], [[BUG-3350]], [[BUG-3355]], [[BUG-3356]], [[BUG-3357]], [[BUG-3358]], [[BUG-3359]], [[BUG-3360]], [[BUG-3373]], [[BUG-3374]], [[BUG-3375]], [[BUG-3376]], [[BUG-3377]], [[BUG-3378]], [[BUG-3379]], [[BUG-3412]], [[ITEM-0159]], [[ITEM-0162]], [[ITEM-0163]], [[ITEM-0164]], [[ITEM-0165]], [[ITEM-0166]], [[ITEM-0167]], [[ITEM-0168]], [[ITEM-0169]], [[ITEM-0170]], [[ITEM-0171]]
- Modules — [[auth]], [[billing]], [[notifications]], [[employees]]

<!-- GRAPH:END -->
