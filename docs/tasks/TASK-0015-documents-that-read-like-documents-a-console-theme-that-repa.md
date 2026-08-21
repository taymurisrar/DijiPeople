---
TASK_ID: TASK-0015
aliases: [TASK-0015]
TITLE: Documents that read like documents, a console theme that repaints, and a stuck tenant with a way out
TYPE: BUG
SIZE: LARGE
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-08-22
AFFECTED_MODULES: [apps/admin, api:contracts, api:tenant-control-plane]
AGENTS: [architect, ui-ux, frontend, backend-api, qa, reviewer, integrator]
DEPENDENCIES:
CURRENT_PACKAGE:
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06, WP-07]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 0
FINAL_STATUS:
---

# TASK-0015 — Documents that read like documents, a console theme that repaints, and a stuck tenant with a way out

## Objective

Five defects reported in one message, four of which are the same shape: a
mechanism that was declared, believed, and never actually connected to anything.
A `formattingRule` on nineteen placeholders that nothing read. A dark theme that
set `color-scheme` and repainted nothing. A `sticky` class disabled by an
`overflow` declaration in a different file. A retry gate refusing on a status
that nothing ever clears. The fifth — a preview that overwrote the document it
was previewing — is the same family seen from the other side: a mode built by
mutating the live value rather than deriving a second one.

It is finished when a generated agreement prints values a person can read, the
preview agrees with the document and cannot damage it, Dark repaints the
console, the fields rail stays put beside a full-width canvas, a stuck tenant
has a stated next action and a working button — and when the UI/UX role has an
audit that would have caught all five, with the mechanical half of it enforced
by tests rather than by being read.

The task also delivers the execution guide the user asked for: a step-by-step
manual suite covering this work and the three rounds before it, to be run
later.

## Work Packages

Boundaries follow ownership and dependency — schema, backend, frontend, security,
integration, migration, QA, browser E2E, deployment. Never "files 1-10".
A good package can be reviewed on its own and has one owning specialist.

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Placeholder formatting that reaches the document | DONE | — | backend-api | agent/document-render-and-theme | — | PASS | BUG-0418 | — | PENDING |
| WP-02 | A preview that cannot damage what it previews | DONE | WP-01 | frontend, ui-ux | agent/document-render-and-theme | — | PASS | BUG-0419 | — | PENDING |
| WP-03 | A dark theme that repaints the console | DONE | — | ui-ux, frontend | agent/document-render-and-theme | — | PASS | BUG-0420 | — | PENDING |
| WP-04 | Sticky containment, and a full-width canvas | DONE | — | ui-ux, frontend | agent/document-render-and-theme | — | PASS | BUG-0421 | — | PENDING |
| WP-05 | A stuck tenant with a stated next action | DONE | — | backend-api, frontend | agent/document-render-and-theme | — | PASS | BUG-0422 | — | PENDING |
| WP-06 | The UI/UX role's output audit | DONE | WP-01..05 | architect, ui-ux | agent/document-render-and-theme | — | NOT_REQUIRED — a role definition; its mechanical half is enforced by the specs it names | — | — | PENDING |
| WP-07 | Test suites, scenarios and an execution guide | DONE | WP-01..05 | qa | agent/document-render-and-theme | — | PASS | — | — | PENDING |

## Assumptions

One row per material assumption. LOW confidence with high impact must be verified
before work depends on it.

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | The raw values in the screenshot come from the renderer, not from bad stored data | `grep -rn "formattingRule"` returns declarations and no reader; the renderer ends in `escapeHtml(value)` for every type outside collections and signatures | HIGH | A data-quality fix would be needed instead, and the formatter would be inert |
| A-02 | Percentages are stored as percentages (99.5 = 99.5%), not as fractions | `validateContractPlaceholderValues` bounds PERCENTAGE to 0–100, which only makes sense on that reading | HIGH | Every service level in every agreement would print a hundred times too small |
| A-03 | `overflow-x: hidden` is what disabled `sticky`, not a missing ancestor height | CSS Overflow 3: a non-`visible`/`clip` value on one axis computes the other to `auto`. The wrapper has auto height and never scrolls | HIGH | The rail would still not stick, and the guard test would be protecting nothing |
| A-04 | Remapping palette utilities is preferable to tokenising ~1,900 call sites | The file already establishes the technique; the alternative turns a theme fix into an app-wide regression sweep | MEDIUM | Coverage gaps in dark mode — bounded, listed on BUG-0420, and each one a call site to convert |
| A-05 | Retry is safe from STALLED because replay is idempotent by design | Only steps marked retryable re-run; owner, subscription and invoice creation never do | HIGH | A retry could duplicate a subscription or an invoice, which is worse than the stuck state it fixes |
| A-06 | Thirty minutes is beyond any legitimate provisioning run | Provisioning is a handful of writes and a domain issue; recorded durations are seconds | MEDIUM | A slow-but-live run could be retried while executing; the step-activity check is the second guard against that |
| A-07 | These changes are correct without browser verification | **Stated as a known limitation, not assumed away.** Every fix here is visual or interactive; the specs assert decisions and structure, never a paint | **LOW** | A fix that is right in principle and wrong on screen — which is how four of this task's five items arrived. The execution guide exists for exactly this |

## Owner Decisions

Genuine product or business questions only. Anything an agent can establish by
reading this repository is an assumption to verify, not a question to ask.

**One, deliberately not decided here.** The seeded service order prints the
tenant's UUID in prose: "Tenant Gulf Horizon (a3f1c7e2-0000-4000-8000-…)". It
was part of what was reported as unfriendly, and it is not obviously wrong — a
service order naming the exact resource it provisions is defensible, and a
customer who opens a support case with that id is easier to help. Removing it
from a legal document is a product call, not a rendering fix, so it is left
alone and named here rather than changed quietly. The execution guide says the
same, so it is not failed as a defect during testing.

## Repository Health

PRE_TASK_REPO_HEALTH — PASS at `fb7c771`, `main` untouched at `3602ec3`, task
worktree cut from `origin/develop`, primary checkout clean.

POST_TASK_REPO_HEALTH — on the engineering history record for this task.

## History

- 2026-08-21 — created at `fb7c771`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0418]], [[BUG-0419]], [[BUG-0420]], [[BUG-0421]], [[BUG-0422]]

<!-- GRAPH:END -->
