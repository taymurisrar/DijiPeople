---
TASK_ID: TASK-0014
aliases: [TASK-0014]
TITLE: Second UX round: lookups that stay lookups, a notification popover, a modern features page and configurable signatures
TYPE: FEATURE
SIZE: LARGE
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-08-21
AFFECTED_MODULES: [apps/landing, apps/admin, api:tenants, api:contracts]
AGENTS: [architect, ui-ux, frontend, backend-api, qa, reviewer, integrator]
DEPENDENCIES:
CURRENT_PACKAGE:
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 0
FINAL_STATUS:
---

# TASK-0014 — Second UX round: lookups that stay lookups, a notification popover, a modern features page and configurable signatures

## Objective

Seven items reported in one message after the previous UX round shipped: two of
them regressions that round introduced, one a defect it aimed at and missed, and
four new. It is finished when the country field is a list under every failure
mode rather than only the happy one, the wizard rail names its steps without
clipping them, the Features page reads as a product page, the notification bell
answers "anything?" without a navigation, a workspace hostname resolves through
one rule instead of three, the tenant timeline states its size and pages, and a
template author can place a signature box for any party — with the parties the
platform can actually sign for distinguished, on screen, from the ones it
cannot.

## Work Packages

Boundaries follow ownership and dependency — schema, backend, frontend, security,
integration, migration, QA, browser E2E, deployment. Never "files 1-10".
A good package can be reviewed on its own and has one owning specialist.

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | A country field that never stops being a list | DONE | — | frontend, ui-ux | agent/ux-round-two | — | PASS | BUG-0350 | — | PENDING |
| WP-02 | A progress rail whose labels fit the space they are in | DONE | — | ui-ux, frontend | agent/ux-round-two | — | PASS | BUG-0351 | — | PENDING |
| WP-03 | One rule for which workspace a hostname addresses | DONE | — | backend-api | agent/ux-round-two | — | PASS | BUG-0353 | — | PENDING |
| WP-04 | A notification popover with a count and a way out of it | DONE | — | frontend, ui-ux | agent/ux-round-two | — | NOT_REQUIRED — presentation over an already-tested projection | — | — | PENDING |
| WP-05 | A tenant timeline that states its size and pages | DONE | — | frontend | agent/ux-round-two | — | PASS | BUG-0352 | — | PENDING |
| WP-06 | A sticky fields rail and a configurable signature box | DONE | — | ui-ux, frontend, backend-api | agent/ux-round-two | — | PASS | — | — | PENDING |
| WP-07 | A features page that reads as a product page | DONE | — | ui-ux, frontend | agent/ux-round-two | — | NOT_REQUIRED — presentation only, over data already asserted elsewhere | — | — | PENDING |

## Assumptions

One row per material assumption. LOW confidence with high impact must be verified
before work depends on it.

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | The country field renders as text because the geography endpoint 404s, not because the change was never deployed | The proxy, the controller and its module registration are all present at `0d10a9d`; the silent fallback in `use-country-options.ts` produces exactly the reported screenshot | HIGH | If the change had genuinely not shipped, the fix would be a deployment step rather than a code change |
| A-02 | `TENANT_NOT_FOUND` is the API's hostname parser, not a missing or inactive tenant | `getTenantSlugFromHost` keys on `WEB_APP_PROD_ROOT_DOMAIN`, which nothing in this repository sets; the spec reproduces the failure from configuration alone | HIGH | A different cause would leave the report open after this fix, for the second time |
| A-03 | A signature box must be a `table`, because `cleanContractHtml` strips `div` and every `data-signature-*` attribute | The allowlist in `contracts.service.ts`, plus a new assertion in `contracts.domain.spec.ts` that a div-based block is stripped | HIGH | A bespoke node would be deleted on first save, silently, and the author would blame the editor |
| A-04 | Wet-ink parties must get ruled lines rather than placeholder tokens | `signature.*` placeholders are configured `fallbackBehavior: LEAVE_TOKEN`, so an unresolvable one prints literally into an executed agreement | HIGH | A signed PDF carrying `{{signature.witness.name}}` where a signature belongs |
| A-05 | The behaviour changes are correct without browser verification | Stated as a known limitation rather than assumed away. Unit assertions cover the decisions; layout, stickiness, popover dismissal and hover states are unobserved | **LOW** | A change that is right in principle and wrong on screen — which is how two of this task's own items arrived |

## Owner Decisions

Genuine product or business questions only. Anything an agent can establish by
reading this repository is an assumption to verify, not a question to ask.

None.

## Repository Health

PRE_TASK_REPO_HEALTH — PASS at `0d10a9d`, `main` untouched, task worktree cut
from `origin/develop`.

POST_TASK_REPO_HEALTH — recorded on the engineering history record for this
task, together with `MAIN_SYNC_STATUS` and the primary-worktree baseline.

## History

- 2026-08-21 — created at `0d10a9d`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0350]], [[BUG-0351]], [[BUG-0352]], [[BUG-0353]]

<!-- GRAPH:END -->
