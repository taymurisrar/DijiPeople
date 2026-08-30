# Engineering History — Admin prod e2e qa

| | |
|---|---|
| **Task Title** | Admin prod e2e qa |
| **Task Type** | QA — with one contained BUGFIX the run produced (BUG-1422) |
| **Date** | 2026-08-26 |
| **Architect Plan** | NOT_APPLICABLE — a QA run. The single fix it produced changes two functions in one file, touches no schema and no API contract, so it sits below the ExecPlan threshold in `PLANS.md`. BUG-1420, which this run found but did **not** fix, does need one. |
| **Agents Used** | QA (primary), Security, Backend/API, Reviewer, Integrator. **Not used, deliberately:** Database — nothing wrote the schema and the database was only ever read through the product API; Release/DevOps — nothing deploys from `develop`; Frontend — the accessibility defects were recorded for triage, not fixed here. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/admin-prod-e2e-qa` |
| **Base SHA** | `8d6be21b` at branch time; rebased onto `a3f4c213` mid-run |
| **Final Task SHA** | `e7bd1e0521e4a7cee18869eb179d368d7c9f998e` |
| **Target Branch** | `develop` — `main` untouched, `MAIN_CHANGE_STATUS = UNTOUCHED` |
| **Merge Commit** | None — integrated by ref-push (`git push origin agent/admin-prod-e2e-qa:develop`), so no merge commit exists and the branch tip is the verified SHA itself |
| **Final Target SHA** | `e7bd1e0521e4a7cee18869eb179d368d7c9f998e` — byte-identical to the Final Task SHA above |

### Commits

```
40995d9a docs(landing-qa): the second phase, and the pattern it produced
8d6be21b docs(mailer): record the log-only mailer nothing uses (ITEM-0101)
5265df9f feat(web): DLP investigator review on the employee record (TASK-0024)
193986dd Merge remote-tracking branch 'origin/main' into agent/dlp-employee-review
b2c196d4 Merge remote-tracking branch 'origin/develop' into agent/dlp-employee-review
10e47f35 docs: regenerate indexes after develop merge (TASK-0024)
a3f4c213 docs(dlp): finalize TASK-0024 — history and records complete
8f21a962 qa(admin): drive the production console end to end, and fix the validation channel
114e7030 qa(admin): record the production run, its two remaining findings, and what it could not prove
2e5be858 qa(admin): test authorization from below, with a role that should not be able to write
63037eb4 qa(admin): drive the list-screen controls and the three widths
1d110b7e qa(admin): regenerate indexes after rebase onto develop
9e3f40b1 qa(admin): drive the record pages, and correct an assertion that did not fit two of them
dacae04b qa(admin): fill in the session record, including what it did not cover
e7bd1e05 qa(admin): regenerate the session indexes
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            8d6be21b [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-admin-qa                           e7bd1e05 [agent/admin-prod-e2e-qa]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
```

### Files Changed

42 file(s) against `origin/main`.

```
M	apps/web/app/(authenticated)/employees/[employeeId]/page.tsx
A	apps/web/app/(authenticated)/employees/_components/employee-dlp-captures.tsx
M	docs/backlog/deferred.md
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0101-mailerservice-silently-logs-instead-of-sending-and-nothing-u.md
M	docs/backlog/open.md
A	docs/bugs/BUG-1419-every-incident-on-the-monitoring-overview-links-to-a-route-t.md
A	docs/bugs/BUG-1420-the-monitoring-severity-filter-cannot-match-99-7-percent-of-.md
A	docs/bugs/BUG-1421-every-admin-screen-shares-one-page-title-two-main-landmarks-.md
A	docs/bugs/BUG-1422-runtime-form-validation-discards-every-field-reason-and-show.md
A	docs/bugs/BUG-1423-runtime-form-controls-have-no-accessible-name-so-screen-read.md
A	docs/bugs/BUG-1424-the-admin-console-serves-no-content-security-policy-header.md
A	docs/bugs/BUG-1425-currencycode-accepts-any-string-of-three-characters-or-fewer.md
M	docs/engineering-history/tasks/2026-08-25-landing-qa-fixes-309abe0d.md
A	docs/engineering-history/tasks/2026-08-26-dlp-employee-review-10e47f35.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
A	docs/qa/known-bug-patterns/read-filter-without-a-write-check.md
M	docs/qa/regressions/index.md
M	docs/qa/runs/2026-08-25-landing-fixes-verification.md
A	docs/qa/runs/2026-08-26-admin-prod-e2e-8d6be21.md
A	docs/qa/scenarios/QA-PLATFORM-023-runtime-form-validation-names-the-field-it-rejected.md
A	docs/qa/scenarios/QA-PLATFORM-024-every-admin-route-and-sidebar-item-is-reachable-and-renders-.md
A	docs/qa/scenarios/QA-PLATFORM-025-the-admin-console-refuses-unauthenticated-access-and-hardens.md
A	docs/qa/scenarios/QA-PLATFORM-026-admin-page-and-api-latency-stay-within-the-established-basel.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-019-platform-admin.md
M	docs/qa/test-plans/index.md
M	docs/sessions/SESSION-0057-fix-the-six-landing-qa-bugs-run-ui-ux-review-unblock-provisi.md
A	docs/sessions/SESSION-0058-dlp-investigator-review-on-the-employee-form.md
A	docs/sessions/SESSION-0059-admin-app-production-e2e-security-and-performance-qa.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
A	docs/tasks/TASK-0024-dlp-investigator-review-on-the-employee-record.md
M	docs/tasks/completed.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	services/api/src/modules/platform-runtime/platform-runtime.service.ts
A	services/api/src/modules/platform-runtime/platform-runtime.validate-contract.spec.ts
```

## Conflicts

Two, both **generated-artifact** conflicts, raised while rebasing onto
`origin/develop` after SESSION-0058 (`agent/dlp-employee-review`) integrated
mid-run:

1. `docs/sessions/index.md` — both sides added a session row. Theirs added
   SESSION-0058, mine added SESSION-0059.
2. `docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md` — both sides
   regenerated the dashboard from their own record set, so the counts and the
   open-bug listing differed.

Neither is a semantic conflict. Both files are **outputs** — `index.md` from
`rebuild-sessions.mjs`, the dashboard from `generate-dashboards.mjs`. Each side
intended exactly the same thing, an index describing the records that exist, and
disagreed only because each could see half of them.

## Conflict Resolutions

Took **origin's side wholesale** on both, then re-ran every generator —
`rebuild-sessions`, `rebuild-backlog`, `rebuild-qa`, `remediation:sync`,
`knowledge:dashboards` — against the combined record set, and committed that
output.

Choosing my side would have lost SESSION-0058's row and produced a dashboard
blind to the DLP work. Choosing origin's side *and stopping there* would have
lost SESSION-0059's. **Hand-merging the hunks would have been worse than
either**: an index assembled by hand describes neither branch's records and is
wrong the moment anyone regenerates it — and because these files are outputs,
nothing fails until somebody notices the numbers disagree with reality.

The rule: for a generated artifact, never merge the artifact. Merge the inputs
and re-run the generator.

## QA

| | |
|---|---|
| **QA Report** | [`2026-08-26-admin-prod-e2e-8d6be21.md`](../../qa/runs/2026-08-26-admin-prod-e2e-8d6be21.md) — **PASS WITH RISKS** |
| **Bug IDs** | Created: BUG-1419, BUG-1420, BUG-1421, BUG-1423, BUG-1424, BUG-1425 — all OPEN, awaiting Architect triage. Created **and fixed**: BUG-1422. |
| **Backlog Items** | None. Every finding was concrete enough to be a bug record; nothing needed the vaguer backlog form. |

## CI

| | |
|---|---|
| **CI Run ID** | `32921836571` |
| **CI Result** | **PASS**, read on `e7bd1e05` — the exact SHA pushed to `develop`. Four earlier runs on this branch were CANCELLED as superseded; none of those verdicts was used. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against `origin/develop` at `e7bd1e05` **after** the ref-push, with the SHA
confirmed by `git rev-parse origin/develop`:

| Command | Result |
|---|---|
| `npx jest` (from `services/api`) | **1800 passed**, 226 suites, 24.0s |
| `npm --workspace api run check-types` | clean, exit 0 |
| `npm run validate:framework` | see note |

Validation reported two failures at that moment, both expected and both artefacts
of filing this record: the dashboards had gone stale against the new history
file, and this record still carried unresolved placeholders — which the validator
requires precisely so a history record cannot be filed and then abandoned. Both
were resolved in the closure commit.

Because the integration was a ref-push rather than a merge, the integrated tree
is bit-identical to the tree CI verified. The reruns above confirm that rather
than discover it.

## Release / Deployment Impact

None — not deployed. `develop` is the integration branch, nothing deploys from
it, and `main` was untouched throughout.

The BUG-1422 fix is therefore **not live**. Production still answers
`"Bad Request Exception"` with no field detail on every runtime form until a
`RELEASE` task promotes `develop` to `main`. Worth stating plainly, because a
bug record marked FIXED reads as fixed-in-production and this one is not.

Rollback class: trivial. The behavioural change is confined to
`readValidationFailure` and the payload shape `dto()` throws; reverting the
commit restores the previous behaviour with no data or schema implications.

## Knowledge Capture

No new `docs/knowledge/` file. What this run learned went into records that are
*selected and re-run* rather than read, which is the more useful home for it:

- **PLAN-019** — E2E, SECURITY and PERFORMANCE moved from `GAP` /
  `NOT_APPLICABLE` to `PARTIAL`, each backed by a scenario rather than an
  assertion. Its Regression Links now record what REG-068 did **not** catch: it
  gates axe on two screens under `wcag2a`/`wcag2aa`, and both accessibility
  defects found here were live throughout — one on create forms it never visits,
  one on landmark rules that tag set does not report at all.
- **QA-PLATFORM-023/024/025/026** — the validation contract, route
  reachability, the security posture including authorization tested from below,
  and the performance baseline.
- **REG-261** — mutation-tested against the original defect.

Three methodological traps were written into those scenarios so they do not have
to be rediscovered: measure concurrency with **distinct** URLs, or the browser's
request coalescing fakes a perfect serialization curve; check a surprising HTTP
status against a privileged session before concluding anything about a role; and
a route sweep must assert **no 4xx during load**, not merely a 200 — otherwise it
passes a screen that prefetches twenty-five dead links.

## Obsidian Sync

Not run. `sync-obsidian.mjs` needs a local vault configuration this environment
does not have, so publishing was skipped rather than half-done.

The Git-tracked side, which the vault is generated from, is complete:
`knowledge:dashboards` regenerated all three dashboards, and every record carries
its `GRAPH` block from `rebuild-backlog` / `rebuild-qa`. A later session with the
vault configured can publish without re-deriving anything.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/wt-admin-qa` removed and the local branch
deleted after this record was filed. `origin/agent/admin-prod-e2e-qa` is left in
place — merged remote branches are deleted by policy, not by the task that made
them.

The primary checkout was clean before this task and is clean after, verified
directly rather than assumed: a task worktree can be spotless while the user's
own workspace is not, which is how a previous task reported CLEANUP_STATUS = DONE
over six changed files. SESSION-0058's worktree was dirty throughout and was left
untouched.

**One production record could not be cleaned up.** Plan
`221cf0ed-b038-4186-af26-5847e4674af6`, created while testing the plans form, has
no delete route — the API exposes `@Delete('plans/:planId/prices/:priceId')` and
nothing for the plan itself, so `DELETE` answers 405. It was neutralised
(`isActive: false`, zero `PlanPrice` rows, so not sellable and not quotable) and
needs removing by someone with database access. Carried in the session record and
the run report as well as here, because a residue named in only one place is a
residue nobody removes.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-1419]] · [[BUG-1420]] · [[BUG-1421]] · [[BUG-1422]] · [[BUG-1423]] · [[BUG-1424]] · [[BUG-1425]] · [[ITEM-0101]] · [[PLAN-019]] · [[QA-PLATFORM-023]] · [[QA-PLATFORM-024]] · [[QA-PLATFORM-025]] · [[QA-PLATFORM-026]] · [[SESSION-0057]] · [[SESSION-0058]] · [[SESSION-0059]] · [[TASK-0005]] · [[TASK-0024]]

<!-- GRAPH:END -->
