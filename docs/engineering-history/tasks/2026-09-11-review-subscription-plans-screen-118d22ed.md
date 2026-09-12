# Engineering History — Review subscription plans screen

| | |
|---|---|
| **Task Title** | Review subscription plans screen |
| **Task Type** | AUDIT — a UI/UX and logic review of one screen, producing records rather than code |
| **Date** | 2026-09-11 |
| **Architect Plan** | NOT_APPLICABLE — a review changes no code, so no ExecPlan class in PLANS.md applies. Two of the findings it produced do need one; see BUG-3331. |
| **Agents Used** | Architect (routing, triage), Frontend (component review), Backend/API (billing service review), Security (entitlement and market gates), QA (live verification), Integrator (branch, CI, develop), Knowledge & Graph (billing note, Obsidian). No subagents were spawned: the investigation was one connected thread through a single screen and its API, and splitting it would have cost the cross-references that produced BUG-3350. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` @ `caad4a56` |
| **Task Branch** | `agent/review-subscription-plans-screen` |
| **Base SHA** | `caad4a56543aace066572a5e6aec87236fee2c54` |
| **Final Task SHA** | `118d22ed5142566f9ea14050fd58a1803c93355f` |
| **Target Branch** | `develop` — ordinary task; `main` untouched |
| **Merge Commit** | None — fast-forward ref-push, no merge commit created |
| **Final Target SHA** | `118d22ed5142566f9ea14050fd58a1803c93355f` — `origin/develop` confirmed at this SHA via the GitHub API |

### Commits

```
69d46bf4 docs(billing): the plans screen quotes a per-seat price as the whole charge
5892d95c docs(billing): the plans screen paints its buttons in the body text colour
118d22ed docs(billing): the plans table sells modules the tenant already has
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            caad4a56 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             2a1a1e06 [agent/attendance-location-capture]
D:/My Work/hrm-dijipeople/dijipeople-audit                      911be0fa [agent/full-technical-audit]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-closeout                   caad4a56 [agent/closeout-sweep]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-monitoring                 c18b5024 [agent/prod-monitoring-triage]
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-r2-storage                 2d86d506 [agent/r2-durable-storage]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/dp-plans-review                       118d22ed [agent/review-subscription-plans-screen]
D:/My Work/hrm-dijipeople/dp-s1-openbugs                        6b87e8fa [agent/cs-s1-openbugs]
D:/My Work/hrm-dijipeople/dp-s10-pii                            484e44c4 [agent/cs-s10-pii]
D:/My Work/hrm-dijipeople/dp-s2-decisions                       3da4a860 [agent/cs-s2-decisions]
D:/My Work/hrm-dijipeople/dp-s3-itemsa                          7017d36f [agent/cs-s3-itemsa]
D:/My Work/hrm-dijipeople/dp-s4-itemsb                          1df6f9e8 [agent/cs-s4-itemsb]
D:/My Work/hrm-dijipeople/dp-s5-security                        eaf29471 [agent/cs-s5-security]
D:/My Work/hrm-dijipeople/dp-s6-triaged                         f3f0977b [agent/cs-s6-triaged]
D:/My Work/hrm-dijipeople/dp-s7-planbugs                        00a5058a [agent/cs-s7-planbugs]
D:/My Work/hrm-dijipeople/dp-s8-planitems                       7b197797 [agent/cs-s8-planitems]
D:/My Work/hrm-dijipeople/dp-s9-auditrecords                    7977a9fd [agent/cs-s9-auditrecords]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

24 file(s) against `origin/main`.

```
M	docs/backlog/deferred.md
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0159-plans-and-features-screen-fails-several-accessibility-basics.md
A	docs/backlog/items/ITEM-0160-feature-comparison-badges-assume-the-api-returns-plans-in-as.md
A	docs/backlog/items/ITEM-0161-subscription-plans-screen-content-and-interaction-polish.md
M	docs/backlog/open.md
M	docs/backlog/product-decisions.md
A	docs/bugs/BUG-3330-plan-cards-quote-a-per-seat-price-as-the-whole-monthly-charg.md
A	docs/bugs/BUG-3331-subscribe-is-enabled-for-a-tenant-that-already-has-an-active.md
A	docs/bugs/BUG-3332-plan-cards-truncate-to-eight-features-so-growth-and-enterpri.md
A	docs/bugs/BUG-3333-tenant-buyers-choose-their-own-currency-and-the-three-price-.md
A	docs/bugs/BUG-3334-tenant-plan-listing-and-checkout-ignore-planprice-publicatio.md
A	docs/bugs/BUG-3335-subscription-plans-screen-overflows-horizontally-on-phones-a.md
A	docs/bugs/BUG-3336-subscription-settings-has-no-loading-or-error-boundary-and-r.md
A	docs/bugs/BUG-3345-subscription-screens-paint-every-primary-action-in-body-text.md
A	docs/bugs/BUG-3350-the-plan-comparison-sells-module-exclusivity-the-platform-is.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/knowledge/modules/billing.md
A	docs/sessions/SESSION-0099-review-tenant-subscription-plans-features-screen.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
```

## Conflicts

None. `origin/develop` did not move between cutting the branch at `caad4a56`
and integrating, so the ref-push was a fast-forward.

## Conflict Resolutions

None — see above. Worth recording what would have conflicted had develop moved:
every commit here touches `docs/backlog/*.md`, the three dashboards and
`TASK-0005-inventory.json`, all of which are generated. The resolution for those
is to take origin's side wholesale and re-run the generators, never to hand-merge
the hunks — a hand-merged index matches neither branch.

## QA

| | |
|---|---|
| **QA Report** | None — findings came from direct review and live verification rather than a QA run. They were written as bug records, which is where a QA run's findings would have landed anyway. |
| **Bug IDs** | `BUG-3330`, `BUG-3331`, `BUG-3332`, `BUG-3333`, `BUG-3334`, `BUG-3335`, `BUG-3336`, `BUG-3345`, `BUG-3350` — nine created, nine triaged, none closed |
| **Backlog Items** | `ITEM-0159`, `ITEM-0160`, `ITEM-0161` — three created and triaged |

Verification ran against the live `dijipeople-demo` tenant: the full price matrix
across three currencies and two billing cycles was read from the rendered DOM,
layout was measured at 390px, 1180px and 1440px, and the entitlement claim behind
`BUG-3350` was tested by navigating to two modules the screen says the plan
excludes. No checkout was started and no tenant data was written.

## CI

| | |
|---|---|
| **CI Run ID** | `34648386854` — the run on `118d22ed`, the exact SHA pushed to develop |
| **CI Result** | PASS — `CI required gate` success |

Two earlier runs on this branch: `34646336084` on `69d46bf4` passed, and
`34647696060` on `5892d95c` was cancelled by the next push. `await-ci.mjs`
classified that one as `REMOTE_CI_STATUS = SUPERSEDED` rather than as a failure.
Neither authorised the integration; only the run on the merged SHA did.

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run in the task worktree at `118d22ed`, which is the SHA `origin/develop` now
points at, so the tree validated is the integrated tree.

| Command | Result |
|---|---|
| `rebuild-backlog.mjs --check` | PASS — 589 records, 0 structural errors |
| `rebuild-sessions.mjs --check` | PASS |
| `rebuild-tasks.mjs --check` | PASS |
| `rebuild-qa.mjs --check` | PASS |
| `generate-component-index.mjs --check` | PASS — 221 documented exports |
| `generate-dashboards.mjs --check` | PASS after regenerating |
| `validate-framework.mjs` | 5,408 of 5,409 checks pass |

Not run, and deliberately: `npm run build`, `lint`, `typecheck` and the Jest
suites. This task changed Markdown records and generated indexes only, and no
build input. CI ran the full gate on this SHA regardless and passed it.

**The one failing check is pre-existing and not attributable to this task.**
`DEVELOP_CONTAINS_MAIN` reports that `origin/develop` does not contain
`origin/main`; measured at the start of the task, `origin/main` was one commit
ahead of `origin/develop`. It compares two refs this branch never wrote, it
failed identically before the first commit here, and a separate branch
`agent/reconcile-main-into-develop` already exists to close it. CI's own
`Framework validation` job passed on all three commits, so the repository gate
does not treat it as blocking either.

## Release / Deployment Impact

None — not deployed. Documentation records and generated indexes only; no
application code, no schema, no migration, no environment variable, no build
input. `main` is untouched and `MAIN_CHANGE_STATUS = UNTOUCHED`, so nothing here
can reach production.

Two of the findings will reach production when acted on. `BUG-3333` changes
live `PlanPrice` rows and `BUG-3350` changes a platform setting that cuts off
tenant access; both are filed as `PRODUCT_DECISION` and neither should be
actioned without the owner's answer and a release record of its own.

## Knowledge Capture

`docs/knowledge/modules/billing.md` — module knowledge. Three additions and one
correction.

The correction matters more than the additions. The note asserted "**Stripe
billing is a stub in code**", which was true when it was generated and has not
been for some time: the module now carries roughly thirty services, a seat
engine, a market and publication model, an order sweeper and webhook
reconciliation. Read as current, that sentence invites an agent to build a second
billing integration beside the real one. It is struck rather than deleted, with
the reason, because the stale claim is itself the lesson — an instance of the
`doc-code-drift` pattern.

Added: the two commercial paths that enforce different rules and why the gate
belongs in a shared predicate; that the Plans screen quotes a response shape the
API stopped using, with the general form — **an optional field on a response type
is where a presentation layer goes stale silently**; that the screen is the web
app's largest design-system holdout, with the measurement; and that
`PlanChangeService` and `SeatChangeService` are registered and injected nowhere,
so anyone building a plan-change flow should read them first.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran: 246 notes written, 1,188 already current,
6 skipped as empty, 0 mappings without a source. Folders touched:
`07 - Bugs/Generated`, `00 - Home/Generated/Sessions`,
`11 - Agent Knowledge` and the dashboards.

`--verify` reports **41 pre-existing graph problems: 37 `GRAPH_ORPHAN` and 4
`DUPLICATE_NODE`.** None belongs to this task. The orphans are bug notes in the
`BUG-3207`–`BUG-3229` range plus `SESSION-0092`; the duplicates are stale
ExecPlan copies left by renames under `PLAN-032`–`PLAN-035`. Every record this
task created carries wikilinks in its Related Items and none appears in the
output.

Per the script's own rule, that caps this task at
`COMPLETE_WITH_DOCUMENTATION_WARNING` rather than failing it: a documentation
automation problem never rolls back healthy work and never hides. The orphans are
other sessions' records and must not be deleted to clear the check.

## Cleanup

Task worktree `D:/My Work/hrm-dijipeople/dp-plans-review` removed with
`scripts/remove-worktree.mjs`, never `git worktree remove` — that command
follows the `node_modules` junction this worktree carries and has previously
deleted thousands of tracked files out of the primary checkout.

The primary checkout was clean at the start and is clean at the end. Two
intermediate states were cleaned during the task: the session record, which
`session.mjs start` wrote into the primary checkout and which was moved into the
task worktree; and `.playwright-mcp/`, which the browser tooling writes into the
repository root. On the first cleanup the whole directory was removed rather than
only this session's files, discarding earlier sessions' screenshots and console
logs. They were gitignored scratch artifacts and no tracked file was affected,
but the removal was wider than it needed to be. The second cleanup removed only
this session's four files.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-3207]] · [[BUG-3229]] · [[BUG-3330]] · [[BUG-3331]] · [[BUG-3332]] · [[BUG-3333]] · [[BUG-3334]] · [[BUG-3335]] · [[BUG-3336]] · [[BUG-3345]] · [[BUG-3350]] · [[ITEM-0159]] · [[ITEM-0160]] · [[ITEM-0161]] · [[PLAN-032]] · [[PLAN-035]] · [[SESSION-0092]] · [[SESSION-0099]] · [[TASK-0005]]

<!-- GRAPH:END -->
