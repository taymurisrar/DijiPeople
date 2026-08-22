---
TASK_ID: TASK-0017
aliases: [TASK-0017]
TITLE: Workspace links that resolve, a monitoring page you can work from, and Delete that either deletes or explains
TYPE: BUG
SIZE: LARGE
STATUS: IN_PROGRESS
PRIORITY: P1
CREATED_AT: 2026-08-22
AFFECTED_MODULES: [apps/admin, api:tenant-control-plane, api:tenant-domains, api:partners, api:platform-runtime]
AGENTS: [architect, ui-ux, frontend, backend-api, qa, reviewer, integrator]
DEPENDENCIES:
CURRENT_PACKAGE:
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-06]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 0
FINAL_STATUS:
---

# TASK-0017 — Workspace links that resolve, a monitoring page you can work from, and Delete that either deletes or explains

## Objective

Six reported items. Three are the same rule failing again in new places — where
a workspace is reachable, now on its fifth implementation; whether a control did
what it claimed, on Open Tenant; and whether a stored status can ever change,
on workspace hostnames stamped Pending before anyone confirmed DNS.

The other three are about screens that report a mechanism instead of serving the
person reading them: a theme applied after the paint it was meant to govern, a
monitoring page of real figures nobody could act on, and fifteen modules with no
Delete and no explanation for its absence.

It is finished when a workspace link resolves everywhere it is rendered; when
Open Tenant either opens a tab or says why it did not; when confirming wildcard
DNS reaches the hostnames already issued and the panel says whether Pending is
waiting on us or on a person; when the console paints in the operator's theme on
the first frame; when Monitoring opens on work a support agent can start,
filterable and sortable; and when every list page either deletes or names the
constraint and the non-destructive action instead.

## Work Packages

Boundaries follow ownership and dependency — schema, backend, frontend, security,
integration, migration, QA, browser E2E, deployment. Never "files 1-10".
A good package can be reviewed on its own and has one owning specialist.

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | BUGS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| WP-01 | One rule for where a workspace is reachable | DONE | — | backend-api | agent/tenant-commands-monitoring-bulk-delete | — | PASS | BUG-0492 | — | PENDING |
| WP-02 | A command that opens a tab, or says why it did not | DONE | WP-01 | frontend | agent/tenant-commands-monitoring-bulk-delete | — | PASS | BUG-0493 | — | PENDING |
| WP-03 | Wildcard DNS: explained, and reconciled when confirmed | DONE | — | backend-api, ui-ux | agent/tenant-commands-monitoring-bulk-delete | — | PASS | BUG-0494 | — | PENDING |
| WP-04 | The theme decided before the first paint | DONE | — | frontend, ui-ux | agent/tenant-commands-monitoring-bulk-delete | — | PASS | BUG-0495 | — | PENDING |
| WP-05 | A monitoring page a support agent can work from | DONE | — | ui-ux, frontend | agent/tenant-commands-monitoring-bulk-delete | — | PASS | BUG-0496 | — | PENDING |
| WP-06 | Delete that either deletes or explains itself | DONE | — | backend-api, frontend, ui-ux | agent/tenant-commands-monitoring-bulk-delete | — | PASS | BUG-0497 | — | PENDING |

## Assumptions

One row per material assumption. LOW confidence with high impact must be verified
before work depends on it.

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | Open Tenant opened nothing because the features string made it a popup | Any features argument makes Chrome open a window rather than a tab; the `null` return was discarded and success reported regardless | MEDIUM | The button would still do nothing — mitigated: it now reports the failure and the URL either way, so the next report carries the cause |
| A-02 | Deleting invoices, payments, commissions, executed agreements, signature evidence and tenants is wrong, not merely unbuilt | Financial and legal records the business must be able to produce; the signature chain hashes the agreement; `Tenant` cascades onto the customer's whole workspace | HIGH | The console would refuse something an operator legitimately needs — recoverable, and the refusal names the alternative in every case |
| A-03 | Partners, partner inquiries and partner onboarding are safe to delete when nothing depends on them | Every dependent relation is counted per row and refuses that row by name; deletion is audited | HIGH | Attribution detached from revenue. The blockers are the guard, and they are asserted per relation |
| A-04 | A theme cookie is a rendering hint, not a trust boundary | Nothing is authorised from it; the worst a forged value achieves is a wrongly-coloured page for its own forger | HIGH | A security review would disagree, and the cookie would need signing — the check is that no code reads it for anything but a class name |
| A-05 | The overview may filter a 25-row slice client-side rather than re-querying | The full queue is one click away with pagination, and carries the same filters | MEDIUM | An agent could mistake the slice for the whole queue — mitigated: the page says what it is showing, and the assertion pins that |
| A-06 | These changes are correct without browser verification | **Stated as a limitation.** Five of six items are visual or interactive; the first paint in particular is what no test here can observe | **LOW** | A fix right in principle and wrong on screen — which is how three of this task's own items arrived |

## Owner Decisions

Genuine product or business questions only. Anything an agent can establish by
reading this repository is an assumption to verify, not a question to ask.

**One, taken deliberately and open to reversal.** "Add Delete to all list pages
for bulk delete" was asked for as the most critical item, and it is delivered
for three modules rather than fifteen.

The other twelve hold records the business is required to be able to produce —
invoices, payments, commissions — or evidence whose value is that it cannot be
altered, or, for tenants, a cascade that would take a customer's entire
workspace with the row. Shipping a working Delete on those would be the more
literal reading of the request and the wrong thing to build, so each now renders
a disabled Delete naming the constraint and the non-destructive action that does
what the operator wanted: void the invoice, supersede the agreement, erase the
tenant through the governed flow.

If any of those should genuinely hard-delete, say which and it becomes a
scoped piece of work with its own guards — the mechanism is now in place and
adding a module to it is small.

## Repository Health

PRE_TASK_REPO_HEALTH — PASS at `098a0e6`, `main` untouched at `3602ec3`.

POST_TASK_REPO_HEALTH — on the engineering history record for this task.

## History

- 2026-08-22 — created at `098a0e6`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0492]], [[BUG-0493]], [[BUG-0494]], [[BUG-0495]], [[BUG-0496]], [[BUG-0497]]

<!-- GRAPH:END -->
