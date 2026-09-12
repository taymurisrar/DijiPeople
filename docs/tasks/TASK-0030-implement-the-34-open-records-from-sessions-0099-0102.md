---
TASK_ID: TASK-0030
aliases: [TASK-0030]
TITLE: Implement the 34 open records from sessions 0099-0102
TYPE: FEATURE
SIZE: LARGE
STATUS: COMPLETE
PRIORITY: P1
CREATED_AT: 2026-09-12
AFFECTED_MODULES: [apps/web, apps/admin, auth, billing, notifications, customization, employees]
AGENTS: [architect, backend-api, frontend, ui-ux, security, integration, qa, reviewer, integrator]
DEPENDENCIES:
CURRENT_PACKAGE: 
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07, WP-08]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 16
FINAL_STATUS: COMPLETE_WITH_DOCUMENTATION_WARNING — 34 records resolved: 22 of 23 bugs fixed, 11 of 11 items done, BUG-3333 left open by owner decision; integrated into develop at 413565f0 behind a green exact-SHA gate and released to production at df0f84f1 via PR #79 under SESSION-0104; Obsidian verify fails on 34 pre-existing problems only, every problem this task introduced having been fixed; visual verification not performed
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
| WP-01 | Tenant plans and subscription screens | DONE | — | frontend, ui-ux | agent/r-s1-billing-web | 0eee4dbb | QA-BILLING-030..034 | BUG-3330, BUG-3332, BUG-3335, BUG-3336, BUG-3345, ITEM-0159 | PASS | MERGED |
| WP-02 | Billing price gating and entitlement enforcement | DONE | — | backend-api, security | agent/r-s2-billing-api | 03664436 | QA-BILLING-035..037 | BUG-3334, BUG-3350, BUG-3331, BUG-3333 | PASS | MERGED |
| WP-03 | Session lifetime, rotation and attribution | DONE | — | security, backend-api, frontend | agent/r-s3-auth | 43721a67 | QA-AUTH-011..016 | BUG-3355, BUG-3356, BUG-3357, BUG-3358, BUG-3359, BUG-3360, ITEM-0162 | PASS | MERGED |
| WP-04 | Web shell theme, customization gate and runtime semantics | DONE | — | ui-ux, frontend | agent/r-s4-webux | 158af0e8 | QA-RUNTIME-010/042/043, QA-AUTHZ-016 | BUG-3373, BUG-3374, BUG-3378, BUG-3412 | PASS | MERGED |
| WP-05 | Lookup convergence and server-side search | DONE | — | frontend, ui-ux | agent/r-s6-lookups | b1a0c9be + 9be94ff0 | QA-UI-001, QA-RUNTIME-044 | BUG-3376, BUG-3377, ITEM-0163 | PASS | MERGED |
| WP-06 | Notification model ownership, catalog and coverage | DONE | — | backend-api, architecture | agent/r-s7-notifications | c0f58fd1 | QA-SETTINGS-018..020 | BUG-3375, BUG-3379, ITEM-0168, ITEM-0169, ITEM-0170, ITEM-0171 | PASS | MERGED |
| WP-07 | Employee record shell and its panels | DONE | WP-04 | frontend, ui-ux | agent/r-s8-employee | 1efef82a + 0011f42f | QA-EMPLOYEE-001 | ITEM-0164, ITEM-0165, ITEM-0166, ITEM-0167 | PASS | MERGED |
| WP-08 | Integration, validation and finalization | DONE | WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07 | integrator, qa, reviewer | agent/records-0099-0102 | 413565f0 | — | — | PASS | MERGED |

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
| D-05 | Should the result stop at `develop`? | No — release to `main`. Handled as a separate RELEASE session, [[SESSION-0104]], because a FEATURE session may not target `main`. | 2026-09-12 |
| D-06 | Enforcement on `main` removes modules from live Starter tenants, including the demo tenant. How should the release handle it? | Grandfather first, then release with enforcement on. | 2026-09-12 |
| D-07 | How far should deploy verification go? | Verify the running commit, and trigger the deploy if it did not fire. | 2026-09-12 |
| D-08 | The dry run showed grandfathering would not protect the demo tenant's Payroll, Recruitment or Onboarding — it has no rows in them. What should happen? | Move the demo tenant to a higher plan rather than grant overrides it never earned. | 2026-09-12 |
| D-09 | Should production be checked for disabled account-activation or password-reset email before deploying? | Check first. Result: none disabled anywhere, so nothing resumes sending. | 2026-09-12 |
| D-10 | Which plan should the demo tenant move to? | Enterprise, which excludes no gated module. | 2026-09-12 |
| D-11 | `nisaco` is also on Starter and does not look like a test account. What should happen to it? | Treat it as disposable; enforcement applies unmodified. | 2026-09-12 |
| D-12 | Promote now, do production data first, or stop at `develop`? | Promote and deploy now. | 2026-09-12 |
| D-13 | Hold any of the session and auth changes back? | Ship all of it, as one coherent change. | 2026-09-12 |
| D-14 | After the deploy, how far should the entitlement cutover go? | All of it: plan change, grandfathering, enforcement on. | 2026-09-12 |
| D-15 | The support case update email works for the first time. Leave it on? | Leave it on. | 2026-09-12 |
| D-16 | The direct database write moving the demo tenant to Enterprise was blocked by a guardrail. How should the plan change happen, and should enforcement wait for it? | The owner makes the change in the admin console. Enforcement switched on anyway, before the demo tenant was protected, knowing it loses Payroll, Recruitment and Onboarding until then. | 2026-09-12 |

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
- 2026-09-12 — the account session limit killed all five running streams at once;
  two had 90 files uncommitted between them and were committed before anything
  else. Every stream resumed from its own transcript.
- 2026-09-12 — all eight packages merged. The integrated branch failed one
  invariant spec no individual stream had failed, and one CI lint ratchet;
  both fixed rather than waived.
- 2026-09-12 — `CI required gate` PASS on `413565f0`; integrated into `develop`
  by ref-push.
- 2026-09-12 — released to production at `df0f84f1` via PR #79 under
  [[SESSION-0104]]; deploy verified live at `/api/health`.
- 2026-09-12 — entitlement cutover in production: two grandfathered overrides,
  enforcement `ENFORCE`. The demo tenant's move to Enterprise is left to the
  owner, the direct write having been correctly blocked.

### The assumptions, checked against what happened

- **A-01 held.** Every stream re-measured before changing code. Two records
  still turned out to be partly wrong about their own premises, and the
  streams corrected them in the records rather than implementing the error.
- **A-02 held.** No migration anywhere and no change to `schema.prisma`, across
  eight streams that each had a route to schema available.
- **A-03 was wrong in a way worth recording.** The streams' code rarely
  collided; their records collided constantly. Four `REG-413`s, three
  `ADR-0009`s and four `EXECPLAN-0037`s, because none of those ids has an
  allocator. See `docs/knowledge/framework/parallel-streams-collide-on-every-unallocated-id-2026-09-12.md`.
- **A-04 was overtaken by an owner decision.** Enforcement did not stay on
  `develop`: the owner released it. It still did not reach production as a
  deploy side effect, because the setting is deliberately kept out of
  `seed-config`, which runs on every deploy.

## Related

[[SESSION-0103]] · [[SESSION-0099]] · [[SESSION-0100]] · [[SESSION-0101]] ·
[[SESSION-0102]]

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-3330]], [[BUG-3331]], [[BUG-3332]], [[BUG-3333]], [[BUG-3334]], [[BUG-3335]], [[BUG-3336]], [[BUG-3345]], [[BUG-3350]], [[BUG-3355]], [[BUG-3356]], [[BUG-3357]], [[BUG-3358]], [[BUG-3359]], [[BUG-3360]], [[BUG-3373]], [[BUG-3374]], [[BUG-3375]], [[BUG-3376]], [[BUG-3377]], [[BUG-3378]], [[BUG-3379]], [[BUG-3412]], [[ITEM-0159]], [[ITEM-0162]], [[ITEM-0163]], [[ITEM-0164]], [[ITEM-0165]], [[ITEM-0166]], [[ITEM-0167]], [[ITEM-0168]], [[ITEM-0169]], [[ITEM-0170]], [[ITEM-0171]]
- Modules — [[auth]], [[billing]], [[notifications]], [[employees]]

<!-- GRAPH:END -->
