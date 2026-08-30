# Engineering History — Attendance location capture

| | |
|---|---|
| **Task Title** | Attendance location capture |
| **Task Type** | BUGFIX |
| **Date** | 2026-08-30 |
| **Architect Plan** | NOT_APPLICABLE — no change class in `PLANS.md` applies. No schema, migration, permission or API contract change; the primary fix is one header value. |
| **Agents Used** | Architect, Backend/API, Frontend, QA, Security (header posture), Integrator. Database and Release/DevOps deliberately not used: `SCHEMA_WRITE: NO`, and this task integrates to `develop` only — the deploy that makes the fix reach employees is the user's to make on `main`. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/attendance-location-capture` |
| **Base SHA** | `855b59418b4b7d18c0b61d4d540ba66282207c76` |
| **Final Task SHA** | `c5c7c13f3ce105af106eb3824e9af44f74c1b4f0` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — fast-forward. `git push origin HEAD:develop` moved `develop` f77c0abb..c5c7c13f, so the integrated tip is byte-identical to the CI-verified SHA. |
| **Final Target SHA** | `c5c7c13f3ce105af106eb3824e9af44f74c1b4f0` (`origin/develop`) |

> The generator diffs against `origin/main`, so the Files Changed list below
> includes work already integrated into `develop` by other sessions (BUG-1966,
> SESSION-0076 and the open-bug-burndown history record). This task's own diff is
> 18 files; `git diff --stat f77c0abb..c5c7c13f` is the accurate view of it.

### Commits

```
b15547d6 docs(history): the open-bug burndown, start to finish
c52daada merge: back-merge main after the release
f77c0abb chore(dashboards): regenerate after the session record closed
c5c7c13f fix(attendance): restore location capture and stop erasing refusal reason codes
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            c22889ab [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             c5c7c13f [agent/attendance-location-capture]
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
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

36 file(s) against `origin/main`.

```
M	apps/admin/next.config.ts
A	apps/web/lib/runtime/modules/attendance-location-payload.spec.ts
M	apps/web/lib/runtime/modules/standard-module-data.adapter.ts
M	apps/web/next.config.ts
M	docs/backlog/index.md
M	docs/backlog/open.md
M	docs/backlog/product-decisions.md
M	docs/bugs/BUG-1966-a-failed-save-in-the-runtime-form-is-swallowed-with-no-messa.md
A	docs/bugs/BUG-2331-permissions-policy-geolocation-makes-web-attendance-check-in.md
A	docs/bugs/BUG-2332-every-attendance-refusal-reaches-the-browser-as-validation-f.md
A	docs/bugs/BUG-2333-storeuseragent-is-ignored-on-the-attendance-module-check-in-.md
A	docs/bugs/BUG-2334-a-location-capture-failure-is-rethrown-as-a-bare-error-disca.md
A	docs/bugs/BUG-2335-allow-approximate-ip-fallback-is-a-live-setting-whose-provid.md
A	docs/engineering-history/tasks/2026-08-30-open-bug-burndown-4d75b37c.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-ATTENDANCE-002-web-attendance-check-in-prompts-for-location-and-records-a-p.md
A	docs/qa/scenarios/QA-ATTENDANCE-003-an-attendance-refusal-renders-as-a-policy-answer-not-the-tec.md
A	docs/qa/scenarios/QA-ATTENDANCE-004-attendance-check-in-omits-the-user-agent-when-storeuseragent.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-009-attendance.md
M	docs/qa/test-plans/index.md
M	docs/sessions/SESSION-0076-open-bug-burndown-fix-all-50-documented-open-and-deferred-bu.md
A	docs/sessions/SESSION-0078-attendance-location-capture-is-blocked-by-permissions-policy.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	packages/config/index.d.ts
M	packages/config/security-headers.js
M	packages/config/security-headers.test.js
A	services/api/src/common/errors/attendance-reason-codes.spec.ts
M	services/api/src/common/errors/error-catalog.ts
```

## Conflicts

None. The task branch was cut from `origin/develop` at `f77c0ab` and `develop`
had not moved when the integration ran, so the push was a fast-forward with no
merge commit and nothing to reconcile.

Verified rather than assumed: `git merge-base --is-ancestor origin/develop HEAD`
returned true immediately before the push, and `origin/develop` was re-read
afterwards to confirm its tip equals the SHA CI passed.

## Conflict Resolutions

None — no conflicts.

One choice worth recording anyway, because a diff cannot show it. Running
`prettier --write` over the changed files reformatted an unrelated line in
`standard-module-data.adapter.ts` (a `relatedRecordPaths` call around line 440).
That hunk was reverted rather than shipped: the committed file is prettier-clean
under the config resolved for its real path, so the reformat came from this
task's invocation, not from a pre-existing violation. Keeping it would have put
an unrelated formatting change into a bugfix diff, which `AGENTS.md` forbids and
which makes a future `git blame` on that line point here for no reason.

## QA

| | |
|---|---|
| **QA Report** | No `docs/qa/runs/` record — this was live exploratory verification against production driven from the task, not a planned run. Its findings are durable as five bug records, three regression entries and three reusable scenarios rather than as a run log. Verdict: **3 defects fixed and verified, 2 recorded open.** |
| **Bug IDs** | Created: BUG-2331, BUG-2332, BUG-2333, BUG-2334, BUG-2335. Fixed here: BUG-2331 (HIGH), BUG-2332 (HIGH), BUG-2333 (MEDIUM). Left open with disposition: BUG-2334 (FIX_NOW), BUG-2335 (PRODUCT_DECISION). |
| **Backlog Items** | None created. BUG-1978 and BUG-1979 were **re-measured, not modified** — their UI premises are already false on `develop` (the two non-catalog checkboxes are gone; the seven mandated settings render disabled). Left for SESSION-0076, which owns the open-bug burndown, so two sessions do not write the same records. |

## CI

| | |
|---|---|
| **CI Run ID** | `33307269678` |
| **CI Result** | PASS — read on `c5c7c13f`, the exact SHA integrated, via `npm run ci:await -- --sha c5c7c13f`. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run in the task worktree after the push, with `HEAD` and `origin/develop` both
confirmed at `c5c7c13f` in the same command, so these are the integrated result
and not the branch:

```
git rev-parse --short HEAD            c5c7c13f
git rev-parse --short origin/develop  c5c7c13f

node --test packages/config/security-headers.test.js   13 pass, 0 fail
jest src/common/errors src/modules/attendance          339 pass, 21 suites
jest --config apps/web/jest.config.js                  1156 pass, 55 suites
npm run validate:framework                             4650 checks
npm run backlog:check                                  393 records, 0 errors
tsc --noEmit (apps/web, apps/admin)                    clean
```

Because the integration was a fast-forward, the merged tree is identical to the
tested branch tree. Stated explicitly rather than left implied, since that is the
only reason branch evidence and integrated evidence coincide here.

Two caveats recorded rather than smoothed over:

- The workspace typechecks first reported a **false failure**. `node_modules` in
  this worktree is junctioned to the primary checkout, so `@repo/config`
  resolved to the *primary's* unmodified `index.d.ts`. Re-run with a `paths`
  override onto this worktree's own `packages/config/index.d.ts`, both apps are
  clean — and the real `index.d.ts` change that the false failure initially
  masked (the missing `geolocation?: boolean`) is committed.
- `services/api` unit tests need `DATABASE_URL` set to any value; several specs
  throw at import without one. No server is required.

## Release / Deployment Impact

**Not deployed.** Integrated to `develop`; `main` is untouched at `855b5941`,
confirmed after the push.

This matters more than usual here. The `Permissions-Policy` header is emitted by
`next.config.ts` at build time, so **no employee sees the fix until `apps/web` is
rebuilt and redeployed.** Until then attendance check-in remains impossible in
production. Promoting `develop` to `main` is the user's decision and their
action.

Rollback class: trivial and independent. Reverting the header restores the prior
(broken) behaviour with no data migration and no state to unwind; the error
catalog additions are purely additive and cannot break an existing code path.

## Knowledge Capture

`docs/qa/known-bug-patterns/reason-code-erased-below-the-classifier.md` — new
pattern. A layer produces a structured reason, a layer above switches on it, and
a layer between replaces it with a generic one; the classifier looks correct in
review, its own tests pass, and it never runs. Three instances appeared in this
one feature (BUG-2332 twice — the code and the evidence fields — and BUG-2334 on
the client), which is what made it worth naming.

It carries the detection heuristic that actually found it: **a comment explaining
why a classifier exists means the symptom already happened once and somebody
fixed the layer they could see.** `attendance-outcome.ts` had exactly such a
comment, describing this defect, above code that had never been reached.

It also records the test property that matters — derive the code list from the
source that emits it, never hand-write it, because a hardcoded list passes on the
day the bug ships. The bug is not in either list; it is in the gap between them.

BUG-2331's own lesson is captured in the record and in the header comment rather
than as a second pattern file: it is an instance of the existing `doc-code-drift`
pattern, expressed in a response header instead of a document.

## Obsidian Sync

`npm run knowledge:sync` ran — 144 files written, 950 already current, 6 skipped
as empty. `npm run knowledge:verify` then reported
**`OBSIDIAN_SYNC_STATUS = FAILED`** on two `GRAPH_ORPHAN` notes:

```
06 - Implementation Plans/Generated/ExecPlans/EXECPLAN-0028-bug-0084-missing-unique-constraints.md
06 - Implementation Plans/Generated/ExecPlans/EXECPLAN-0028-plan-entitlement-enforcement.md
```

**Pre-existing, and proven so rather than asserted.** Both were added by commits
(`dca93c47`, `ce6478ac`) that `git merge-base --is-ancestor` confirms are
ancestors of this task's base `f77c0abb`, and `git show --stat c5c7c13f` shows
this commit touches neither file. Status counters were otherwise clean:
`OBSIDIAN_STATUS_MISMATCHES 0`, `SEMANTIC_LINK_ERRORS 0`, `DUPLICATE_NODES 0`,
`STALE_NODES 0`.

Not fixed here, deliberately. They are two other sessions' ExecPlan records and
repairing them is that work's to do, not a bugfix task's. Worth flagging to
whoever owns them: **the two files share the id `EXECPLAN-0028`** — an allocator
collision of exactly the kind `scripts/allocate-id.mjs` exists to prevent, and
the likely reason neither carries a usable inbound link.

Per this repository's own rule — a documentation-automation failure never rolls
back healthy work and never hides either — this task is capped at
**COMPLETE_WITH_DOCUMENTATION_WARNING**.

## Cleanup

Task worktree `D:/My Work/hrm-dijipeople/dijipeople-attendance-loc` and branch
`agent/attendance-location-capture` are **retained**, not removed. BUG-2334 is
dispositioned FIX_NOW and is the natural next task in the same files; tearing the
worktree down to rebuild it immediately would be churn.

`node_modules` in it are **junctions to the primary checkout**, so removal must
go through `node scripts/remove-worktree.mjs`, never `git worktree remove` or a
recursive delete — both follow junctions and have previously emptied thousands of
tracked files out of the user's primary checkout.

The primary checkout was returned to its exact starting baseline: one
pre-existing untracked file
(`services/api/src/modules/tenant-settings/tenant-settings-reader-coverage.spec.ts`),
present before this task began and not touched by it. The Playwright MCP
artifacts this task wrote into `.playwright-mcp/` were removed; the ten files
remaining there are dated 2026-08-29 and belong to another session.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-1966]] · [[BUG-1978]] · [[BUG-1979]] · [[BUG-2331]] · [[BUG-2332]] · [[BUG-2333]] · [[BUG-2334]] · [[BUG-2335]] · [[PLAN-009]] · [[QA-ATTENDANCE-002]] · [[QA-ATTENDANCE-003]] · [[QA-ATTENDANCE-004]] · [[SESSION-0076]] · [[SESSION-0078]] · [[TASK-0005]]

<!-- GRAPH:END -->
