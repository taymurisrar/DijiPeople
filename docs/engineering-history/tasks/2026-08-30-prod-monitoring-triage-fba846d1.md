# Engineering History — Prod monitoring triage

| | |
|---|---|
| **Task Title** | Prod monitoring triage |
| **Task Type** | BUGFIX |
| **Date** | 2026-08-30 |
| **Architect Plan** | NOT_APPLICABLE — a triage of an existing production surface. Each finding was scoped to one module and none met the ExecPlan classes in PLANS.md. BUG-2462 was triaged `PLAN_REQUIRED` and its substantive half deliberately left unimplemented for that reason. |
| **Agents Used** | Architect throughout, acting also as Backend/API, Frontend, QA, Reviewer, Integrator and Release/DevOps. No subagents were spawned — the session was explicitly instructed not to use the Agent tool. Database was not required: no schema or migration change. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/prod-monitoring-triage` |
| **Base SHA** | `fba846d19d979cd78253866c12881865d9fddebc` |
| **Final Task SHA** | `fba846d19d979cd78253866c12881865d9fddebc` |
| **Target Branch** | `main` |
| **Merge Commit** | `fba846d19d979cd78253866c12881865d9fddebc` (PR #61) |
| **Final Target SHA** | `fba846d19d979cd78253866c12881865d9fddebc` |

### Commits

```
(none — the branch has no commits beyond its base)
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            c22889ab [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             2a1a1e06 [agent/attendance-location-capture]
D:/My Work/hrm-dijipeople/dijipeople-attn-corr                  ade1fea7 [agent/attendance-correction-entry]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-monitoring                 fba846d1 [agent/prod-monitoring-triage]
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

0 file(s) against `origin/main`.

```
(no differences against the base)
```

## Conflicts

One rebase, onto `origin/develop` @ `7cd9a556`, after a concurrent session moved
develop three commits ahead mid-task. Ten files conflicted, all of them generated
or append-only indexes:

- `docs/backlog/{index,open,deferred}.md`
- `docs/knowledge/dashboards/{DijiPeople Engineering Dashboard,Engineering Control Center}.md`
- `docs/qa/{coverage-matrix.md,scenarios/index.md,test-plans/index.md}`
- `docs/sessions/index.md`
- `docs/qa/regressions/index.md` — **not** generated; hand-written and append-only


## Conflict Resolutions

For the nine generated indexes: took `--ours` (origin/develop) wholesale and
re-ran every generator — `backlog:rebuild`, `qa:rebuild`, `rebuild-sessions`,
`tasks:rebuild`, `remediation:sync`, `knowledge:dashboards`. Hand-merging those
hunks yields an index matching neither branch.

`docs/qa/regressions/index.md` needed different treatment and the first attempt
was wrong. Both sides were pure appends — origin added REG-365 and REG-366, this
branch added REG-367…371 — so the conflict markers were simply stripped to keep
both. That silently **truncated REG-366**, whose `Root cause`, `Fixed` and
`Active` rows fell inside the hunk git had aligned against the appended block.
It surfaced two steps later as `backlog:rebuild` failing with "Status FIXED
requires RegressionId REG-366 to be active". Resolved properly by rebuilding the
file from `git show origin/develop:docs/qa/regressions/index.md` plus this
branch's appended entries.

**What would have gone wrong unnoticed:** nothing, on this occasion — the
validator caught it. But it only caught it because BUG-2384 on the other side
was `FIXED` and cited REG-366. Had the truncated entry belonged to an `OPEN`
record, the register would have shipped with a mangled entry and no check would
have fired. Strip-the-markers is not a safe resolution for an append-only
hand-written file.


## QA

| | |
|---|---|
| **QA Report** | No separate run file. QA was the triage itself: the full 1,897-row production queue was pulled and aggregated, and every finding was verified against live production before a record was written. Scenarios QA-AUTH-009, QA-API-002, QA-ATTENDANCE-007, QA-PLATFORM-028…031 carry the reusable checks. |
| **Bug IDs** | Created: BUG-2458, BUG-2459, BUG-2460, BUG-2461, BUG-2462, BUG-2463, BUG-2464, BUG-2465, BUG-2494, BUG-2495. Seven closed FIXED, one PLAN_REQUIRED (BUG-2462), one DEFERRED (BUG-2463), one DUPLICATE (BUG-2464). |
| **Backlog Items** | None created or advanced. |

## CI

| | |
|---|---|
| **CI Run ID** | 33328167774 (PR #61); branch runs 33326365861 and 33327347447 |
| **CI Result** | PASS — `CI required gate` green on the merge commit and on both branch commits |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against the merged SHA `fba846d1`:

- `validate:framework` — 4740 checks, pass
- api: 2384 tests / 281 suites, pass · `tsc --noEmit -p tsconfig.build.json` clean
- web: 1174 tests / 57 suites, pass
- admin: 399 tests / 44 suites, pass
- CI `required gate` — PASS on run 33328167774

Then against live production once `fba846d` was serving:

- `GET /api/health` reports `commitShort: fba846d`
- `GET /platform/logs/events` now returns a measured `investigating: 0`, the
  metric added for BUG-2495 — previously this read 27 by subtraction
- the triage queue fell from **1,870 NEW to 191** after the backfill

Pre-existing and unrelated: `apps/web` and `apps/admin` `next.config.ts` report
TS2353 on a `geolocation` key when `tsc` runs without `next typegen` first.
Reproduced with this branch stashed, so it is not caused by this work.


## Release / Deployment Impact

**Deployed to production.** `RELEASE` was authorised explicitly by the owner for
this task, overriding the standing rule that they promote `main` themselves.

- Render `srv-d7js7fqqqhas739v4i7g`, deploy `dep-daa7ihvlk1mc738koolg`, live at
  `fba846d`. Verified by commit hash at `/api/health`, not assumed — a previous
  merge sat undeployed for 48 minutes with no error.
- `diji-people-admin` redeployed on Vercel, carrying the BUG-2495 tile fix.
- No migrations. No new environment variables. No schema change.

**Rollback class:** ordinary revert. Every code change is additive or removes a
validation; nothing narrows a contract. The one data change — 1,680 incident rows
moved `NEW` → `NOT_AN_INCIDENT` — is reversible from the manifest
`incident-backfill-1788116346256.json` via
`scripts/backfill-incident-classification.mjs --revert <manifest>`.

**One production action deliberately left to the owner:** attendance entry
`85303ef3-4285-45d4-a751-370a00a78828` is still open from `12:43:50Z`. The
BUG-2494 fix makes it closable, but checking it out now would write ~6 hours of
elapsed time into a record that feeds timesheets and payroll. That is the
employee's call, not the framework's.


## Knowledge Capture

Ten bug records under `docs/bugs/` (BUG-2458…2465, 2494, 2495), each carrying
measured evidence rather than inferred description.

Seven regression register entries, REG-367…373. Two new QA test plans —
PLAN-030 (monitoring) and PLAN-031 (routing) — created because no plan covered
either area and a scenario outside every plan is never selected for a re-run.
Seven scenarios: QA-AUTH-009, QA-API-002, QA-ATTENDANCE-007, QA-PLATFORM-028
through 031.

Two durable invariants were added rather than one-off tests, because both faults
are the kind that recur:

- `route-shadowing.invariant.spec.ts` walks all 109 controllers for a static
  route declared beneath a parameterised one that shadows it.
- `investigating-count.spec.ts` asserts the monitoring metric and its view filter
  read one shared predicate, and that four non-working statuses stay excluded.

**Every new assertion was mutation-tested** — each fix reverted, the test
confirmed to fail, the fix restored. The check-out case failed with the exact
production message.

Two corrections were recorded rather than quietly dropped: the claim that the
client-reported path never runs the classifier (it does), and the claim that
correction requests dispatch no notification (they do). Both are noted in
BUG-2465 and in the handoff document respectively.


## Obsidian Sync

`knowledge:dashboards` regenerated the Engineering Dashboard, the Product
Dashboard and the Engineering Control Center. `validate:framework` passes its
graph checks, including the orphan and wikilink rules.

`sync-obsidian.mjs` was not run — it needs a local vault configuration this
session did not hold. `OBSIDIAN_SYNC_STATUS = NOT_REQUIRED` for that reason,
stated rather than assumed.

One validation failure worth recording: `REG-281 (in double brackets)` was written as a wikilink
in BUG-2495 and failed the "no document links a regression id as a wikilink"
check. The register is one file, not a note per regression, and backticks do not
escape the brackets.


## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-monitoring` **retained** at
handoff — the two follow-on items (attendance correction requests, web auth
validation) are documented and unstarted, and the next session will want it.
Remove it with `scripts/remove-worktree.mjs`, never `git worktree remove`, which
follows the `node_modules` junctions.

The primary checkout was clean throughout and ends as it began: one untracked
file, `tenant-settings-reader-coverage.spec.ts`, which is the owner's and was
present before this task started. Recorded as the `--primary-baseline` at
PRE_TASK_REPO_HEALTH and unchanged at POST.

MCP browser artifacts written into the checkout root during verification were
deleted. `develop` was fast-forwarded to `fba846d1` so it contains `main`.

