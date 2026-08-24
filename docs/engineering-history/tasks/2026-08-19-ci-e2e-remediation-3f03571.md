# Engineering History — CI browser install latency and the database e2e fixture contract

| | |
|---|---|
| **Task Title** | CI browser install latency and the database e2e fixture contract |
| **Task Type** | INFRA |
| **Date** | 2026-08-19 |
| **Architect Plan** | NOT_APPLICABLE — `PLANS.md` requires an ExecPlan for schema, auth/permission, payroll, provisioning and integration changes. This task changed test fixtures, one seed's module shape, CI configuration and framework documentation. No migration, no runtime authorization change. |
| **Agents Used** | Architect (orchestration, triage), Database Agent (lead — fixture contract, cascade behaviour, seed reconciliation), QA (scenarios, regression register, the evidence), Release/DevOps (lead — browser install RCA, CI promotion), Reviewer, Integrator. **Deliberately not used:** Backend/API and Security. Both were named as conditional in the request — "only for genuine application defects revealed after fixtures are correct". Once the fixtures were correct, 295 of 295 tests passed. There was no application defect and no tenant-isolation, gateway or auth failure to route to them. Not invoking them is the finding, not an omission. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/ci-e2e-remediation` |
| **Base SHA** | `cda00331bd48ba1e809d54e98e2dbf7f28ebb7ca` |
| **Final Task SHA** | `5a47dfff0c4cb98cd10d8df533645147e7ac8c72` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — ref-push integration, so develop's tip IS the verified SHA rather than a merge of it |
| **Final Target SHA** | `5a47dfff0c4cb98cd10d8df533645147e7ac8c72` (develop) |

### Commits

```
1154a37 fix(test): the database e2e suites build their own tenants
227f289 fix(test): legal and partner onboarding suites own their fixtures
e6f4cbe feat(ci): detect the three failures a duration alone cannot carry
ff34b92 docs(qa,backlog): close ITEM-0047, raise BUG-0079, record the pattern
3f03571 feat(ci): promote Database e2e into the required gate
718fb24 docs(qa,history): the QA run and engineering history for this task
ed82f05 merge: bring develop into agent/ci-e2e-remediation
2aacab8 docs(qa): renumber this branch's REG ids to 069-070 after the collision
944ab4e test: record the post-merge run — 25 suites, 304 tests, still green
```

The record's filename carries `3f03571`, the SHA it was filed at. The Git table
above carries the final one. Both are kept rather than renaming the file: the
filename is how the record is referenced elsewhere, and a record that renames
itself as work continues is a record nobody can link to.

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            cda0033 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75 [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab11 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     3f03571 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8 [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622e [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                7557d14 [agent/self-service-onboarding-provisioning]
```

### Files Changed

45 file(s) against `origin/develop`.

```
M	.agent/agents/database.md
M	.agent/agents/integrator.md
M	.agent/agents/qa.md
M	.agent/context/ci-operations.md
M	.agent/context/testing-architecture.md
M	.github/workflows/ci.yml
M	AGENTS.md
M	docs/backlog/completed.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0047-database-e2e-suites-fail-against-an-ephemeral-postgresql.md
M	docs/backlog/open.md
A	docs/bugs/BUG-0079-browser-e2e-spends-its-whole-install-step-on-apt-work-that-i.md
M	docs/development/ci.md
M	docs/knowledge/architecture/ci-architecture.md
M	docs/knowledge/architecture/qa-and-ci-architecture.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
M	docs/qa/known-bug-patterns/README.md
A	docs/qa/known-bug-patterns/borrowed-fixture-dependency.md
M	docs/qa/regressions/index.md
M	docs/qa/scenarios/QA-CI-001-report-only-jobs-publish-an-explicit-pass-fail-verdict.md
A	docs/qa/scenarios/QA-DEPLOY-016-the-browser-install-does-no-apt-work-and-proves-the-browser-.md
A	docs/qa/scenarios/QA-TENANT-006-database-e2e-fixtures-build-two-isolated-tenants-and-clean-u.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-003-tenant-isolation.md
M	docs/qa/test-plans/PLAN-012-deployment-release.md
M	docs/qa/test-plans/index.md
M	docs/qa/test-strategy/e2e-suite-classification.md
A	docs/sessions/SESSION-0019-ci-browser-install-latency-and-database-e2e-fixture-contract.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	e2e/package.json
M	scripts/ci-metrics.mjs
A	scripts/install-browser.mjs
M	services/api/prisma/seed-legal.ts
M	services/api/test/attendance-engine.e2e-spec.ts
M	services/api/test/attendance-integrations-http.e2e-spec.ts
A	services/api/test/db-fixtures-contract.e2e-spec.ts
M	services/api/test/gateway-runtime.e2e-spec.ts
M	services/api/test/helpers/db-fixtures.ts
M	services/api/test/legal-documents.e2e-spec.ts
M	services/api/test/legal-seed.e2e-spec.ts
M	services/api/test/platform-workflows.e2e-spec.ts
```

## Conflicts

None. `agent/ci-e2e-remediation` was cut from `origin/develop` at `cda0033`
and integrated by ref-push, so the tip is byte-identical to the CI-verified
SHA. Three other sessions were active throughout — SESSION-0003, SESSION-0015
and SESSION-0018 — and `session.mjs check` classified this work
`SAFE_PARALLEL` before planning. No shared-resource lease was taken: nothing
here writes the schema, and the database this task used was a throwaway of its
own creation.

The one file with genuine cross-session exposure is `AGENTS.md`. Moving its
provenance lines required re-deriving the figures they vouch for, and
`@Public()` had drifted from 32/12 to 33/13 through another session's work —
corrected here, in passing, because leaving a figure wrong under a provenance
line dated today would be worse than not moving the line.

## Conflict Resolutions

Not applicable — no conflicts.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-19-ci-e2e-remediation-3f03571.md`](../../qa/runs/2026-08-19-ci-e2e-remediation-3f03571.md) — **PASS** |
| **Bug IDs** | `BUG-0079` created and fixed (browser install). No bug record was created for the database e2e failures: 81 red tests from one unmet precondition are one finding, carried by `ITEM-0047`. |
| **Backlog Items** | `ITEM-0047` closed DONE. `ITEM-0055` is answered by the same evidence and recommended for closure by the Architect — serialisation was never the cost. |

## CI

| | |
|---|---|
| **CI Run ID** | `32308844551` — on `5a47dff`, the exact SHA integrated |
| **CI Result** | **PASS** — all fourteen jobs success, `CI required gate` included |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

`origin/develop` is `5a47dff` — byte-identical to the SHA CI verified, because
ref-push integration keeps the tip equal rather than merging into it. So the
run below IS the post-merge evidence; there is no second tree to re-prove.

Run `32308844551`, and the run before it on the same content, `32307298504`:

```
Database e2e   25 suites / 304 tests / 92.43s   ← success AS A REQUIRED JOB
Browser e2e    56 journeys / 5.5m               ← install step 12.6s
CI required gate                                 success
```

That `Database e2e` line is what this task was for. The job has been
report-only for its entire existence and had no completing run at all for three
days; this is the first time it has passed, and the first time a failure in it
could have blocked anything.

Re-validated locally against the integrated SHA: framework validation 2795
checks, all four record-index checks current, and the full database e2e suite
green.

## Release / Deployment Impact

None — not deployed. `MAIN_CHANGE_STATUS = UNTOUCHED`. This is an ordinary task
targeting `develop`, and nothing here reaches an environment.

One forward-looking note for Release/DevOps: `Database e2e` is now a blocking
gate, so a data-integrity or tenant-boundary regression will stop a merge that
would previously have passed. That is the intent. If it proves flaky, move it
back to report-only **with the failing evidence** — not silently, and not by
deleting a suite.

## Knowledge Capture

| File | Category | What it carries |
|---|---|---|
| `docs/qa/known-bug-patterns/borrowed-fixture-dependency.md` | **New pattern** | A test that asserts against data it did not create, and the teardown half that travels with it. The most reusable thing this task produced. |
| `docs/qa/regressions/index.md` | Register | REG-066, REG-067 |
| `docs/qa/scenarios/QA-DEPLOY-016`, `QA-TENANT-006` | Scenarios | Re-runnable, with expected results written before execution |
| `.agent/context/ci-operations.md` | Framework | `STEP_DURATION_REGRESSION`, `JOB_TIMEOUT`, `E2E_FIXTURE_CONTRACT_BROKEN`, and the promotion |
| `docs/backlog/items/ITEM-0047…` | Backlog | The resolution, including the correction that its own three-group hypothesis was one cause |
| `docs/qa/test-strategy/e2e-suite-classification.md` | Strategy | Promotion recorded against the criteria, with the tables kept as historical evidence |

The lesson worth carrying beyond this repository: **a job median hides a step,
and a cancelled job hides a timeout.** Both defects here were watched for days
by instrumentation pointed at the right run that could not see the problem.

## Obsidian Sync

`npm run knowledge:sync` then `knowledge:verify`, the second because sync's exit
code only says it wrote the files.

```
OBSIDIAN_SYNC_STATUS = PASS
NOTES_VERIFIED              437
WIKILINKS_CHECKED           2242
OBSIDIAN_UNRESOLVED_LINKS   0
OBSIDIAN_ORPHAN_COUNT       0
OBSIDIAN_SOURCE_ORPHANS     0
OBSIDIAN_GRAPH_ORPHANS      0
OBSIDIAN_STALE_GENERATED    0
OBSIDIAN_PARITY_DIFFS       0
```

Verify caught two things sync did not: a REG id written as a wikilink when
REG ids have no per-id note, and the new bug pattern landing as a GRAPH_ORPHAN —
unreachable in the graph, so findable only by someone who already knew it
existed. Both fixed before this line was written.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-ci-e2e` removed and the local
branch deleted after integration. The primary checkout was fast-forwarded from
`953ab11` to `5a47dff` so `DEVELOP_SYNC_STATUS = SYNCED`; it was clean before
and after, and nothing of the user's was staged, committed or reverted.

The throwaway databases `dijipeople_e2e_fix` and `dijipeople_e2e_fixt` are this
task's own and are dropped. The populated `dijipeople` development database was
never touched — every run used a database this task created.
