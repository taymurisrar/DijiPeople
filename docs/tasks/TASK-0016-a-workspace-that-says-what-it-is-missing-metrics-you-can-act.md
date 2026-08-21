---
TASK_ID: TASK-0016
aliases: [TASK-0016]
TITLE: A workspace that says what it is missing, metrics you can act on, and a checkout block with a code
TYPE: BUG
SIZE: LARGE
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-08-22
AFFECTED_MODULES: [apps/admin, apps/landing, api:tenant-control-plane, api:platform-events]
AGENTS: [architect, ui-ux, frontend, backend-api, qa, reviewer, integrator]
DEPENDENCIES:
CURRENT_PACKAGE:
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 0
FINAL_STATUS:
---

# TASK-0016 — A workspace that says what it is missing, metrics you can act on, and a checkout block with a code

## Objective

Six reported items. The largest is a tenant that is ACTIVE, reachable and signed
into, reporting "Workspace: Not provisioned" with a disabled Retry button and no
recorded provisioning run — the record read health off the *record of an
attempt* rather than off the workspace itself, so any tenant outside the happy
path became unexplainable and, because retry is gated on a lifecycle state a
working tenant has left, unrepairable.

The rest are the same instinct in smaller places: a badge counting over a window
sized by the page it was fetching, an estimator listing plans its input cannot
move, a monitoring queue whose five tiles were mislabelled and inert behind a
skipped Overview, and a checkout block that showed a disabled form where it
should show a code somebody can quote.

It is finished when the tenant record names every deficiency and repairs what
this console can repair; when the unread count is the same number whoever asks;
when the estimator lists only plans headcount changes; when Monitoring opens on
Overview with metrics that narrow the table and state their window; and when the
subscribe page shows no form at all, plus a support code whose meaning stays
internal.

## Work Packages

Boundaries follow ownership and dependency — schema, backend, frontend, security,
integration, migration, QA, browser E2E, deployment. Never "files 1-10".
A good package can be reviewed on its own and has one owning specialist.

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Workspace health, and a repair that is not a retry | DONE | — | backend-api, frontend | agent/tenant-repair-and-console-ux | — | PASS | BUG-0463 | — | PENDING |
| WP-02 | An unread count that does not depend on who asks | DONE | — | backend-api, frontend | agent/tenant-repair-and-console-ux | — | PASS | BUG-0460 | — | PENDING |
| WP-03 | An estimator scoped to what headcount changes | DONE | — | frontend, ui-ux | agent/tenant-repair-and-console-ux | — | PASS | BUG-0461 | — | PENDING |
| WP-04 | Monitoring: Overview first, metrics that act | DONE | — | ui-ux, frontend | agent/tenant-repair-and-console-ux | — | PASS | BUG-0462 | — | PENDING |
| WP-05 | A checkout block with a quotable code and no form | DONE | — | ui-ux, frontend | agent/tenant-repair-and-console-ux | — | PASS | — | — | PENDING |

## Assumptions

One row per material assumption. LOW confidence with high impact must be verified
before work depends on it.

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | The reported tenant is usable and merely missing its hostname and a stale sub-status | The screenshot shows ACTIVE, a signed-in session, and Workspace "Not provisioned"; BUG-0312 explains why issuance is skipped silently | HIGH | The repair would report success on a tenant that is genuinely broken elsewhere — which is why every finding is derived and re-derived after the repair, rather than assumed |
| A-02 | Issuing a hostname outside provisioning is safe | `createSystemDomain` is idempotent, demotes any other primary first, and is refused by a unique index if the hostname belongs to another tenant | HIGH | A hostname collision, or two primaries — both refused at the database, so the failure mode is an error rather than corruption |
| A-03 | The badge's missing count is the scan width, not a caching or auth problem | `take: limit * 20` with a badge polling `limit=1`; the count appears at `limit=6` | HIGH | The badge would still be wrong after this, and the guard would be protecting nothing |
| A-04 | Flat-priced plans do not belong in a headcount estimator | `estimateCost` sets `billable = 1` for a FLAT offer, so the figure is constant under the control | HIGH | Hiding a plan a visitor wanted to compare — mitigated: the cards above still show every plan and its price |
| A-05 | Two checkout codes are enough, and more would leak | `deriveCheckoutReadiness` distinguishes ten causes, all of them descriptions of our billing wiring | MEDIUM | Support has to open the console to learn the specific cause — which is where the full list already is, and where an operator is anyway |
| A-06 | These changes are correct without browser verification | **Stated as a limitation.** Five of the six items are visual; the specs assert decisions and structure, never a paint | **LOW** | A fix right in principle and wrong on screen. The execution guide exists for this |

## Owner Decisions

Genuine product or business questions only. Anything an agent can establish by
reading this repository is an assumption to verify, not a question to ask.

**One, deliberately not taken.** The monitoring queue opens on "all time",
which over 12,005 incidents is a firehose rather than a work queue. Narrowing
the default window would make the page open on less than everything — a decision
about what that queue is *for*, not a UX repair, and doing it quietly is how a
monitoring screen starts hiding incidents. The window is now stated on every
tile so the scope is at least visible; changing it is yours to call.

## Repository Health

PRE_TASK_REPO_HEALTH — PASS at `3883798`, `main` untouched at `3602ec3`,
primary checkout clean.

POST_TASK_REPO_HEALTH — on the engineering history record for this task.

## History

- 2026-08-21 — created at `3883798`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0312]], [[BUG-0460]], [[BUG-0461]], [[BUG-0462]], [[BUG-0463]]

<!-- GRAPH:END -->
