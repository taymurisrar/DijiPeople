# Engineering History — Approvals inbox decisions

| | |
|---|---|
| **Task Title** | Approvals inbox decisions |
| **Task Type** | FEATURE — with a BUGFIX inside it. The blank record page was a defect; the inbox never having had a decision path was unfinished work. |
| **Date** | 2026-08-31 |
| **Architect Plan** | NOT_APPLICABLE — no schema change, no migration, no new architecture. The decision path extends the existing module/adapter/command runtime rather than introducing a competing one, which is the bar `PLANS.md` sets for requiring an ExecPlan. |
| **Agents Used** | Architect, Backend/API, Frontend, Security, QA, Reviewer, Integrator, Knowledge & Graph. **Database was not used** — nothing in this task touches Prisma. **Release/DevOps was not used here**: the task targets `develop`, and the promotion to `main` belongs to the release record. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/approvals-inbox-decisions` |
| **Base SHA** | `6d17e931ba46aac50194cc455eeb3846a8840af8` |
| **Final Task SHA** | `d084dd7bfff621f8440601b6c2c710b9b5899a98` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — integrated by ref-push (`git push origin agent/approvals-inbox-decisions:develop`), so `develop`'s tip *is* the CI-verified commit rather than a merge of it. |
| **Final Target SHA** | `d084dd7bfff621f8440601b6c2c710b9b5899a98` — byte-identical to the Final Task SHA, which is the point of the ref-push. |

### Commits

```
ce23d503 docs(release): the four-defect release, and what finding them cost
1b048164 docs(release): scheduled report delivery verified in production
2b001494 docs(handoff): email sink visibility, for a fresh session to finish
3f460e42 docs(bugs): record the attendance integration activation deadlock
8264c342 feat(approvals): make the inbox show its records and decide through the owning module
60389593 chore(records): regenerate indexes after rebasing onto develop
72f30cfa test(approvals): guard the seam between the command spec and the record
d084dd7b chore(records): regenerate the component index for the extracted record builder
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            c22889ab [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-approvals                  d084dd7b [agent/approvals-inbox-decisions]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             2a1a1e06 [agent/attendance-location-capture]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-mail                       1b60690f [agent/email-sink-visibility]
D:/My Work/hrm-dijipeople/dijipeople-monitoring                 c18b5024 [agent/prod-monitoring-triage]
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

50 file(s) against `origin/main`.

```
M	.agent/context/component-index.md
M	apps/web/app/(authenticated)/approvals/[approvalId]/page.tsx
M	apps/web/app/(authenticated)/approvals/page.tsx
M	apps/web/app/api/approvals/[...path]/route.ts
A	apps/web/app/components/approvals/approval-chain.tsx
A	apps/web/app/components/approvals/approval-display.ts
A	apps/web/app/components/approvals/approval-record.ts
M	apps/web/app/components/approvals/approval-types.ts
M	apps/web/lib/runtime/command-payload-schema.ts
A	apps/web/lib/runtime/modules/approval-decision-commands.spec.ts
M	apps/web/lib/runtime/modules/standard-module-data.adapter.ts
M	apps/web/lib/runtime/modules/standard-module-specs.ts
M	docs/backlog/index.md
M	docs/backlog/open.md
A	docs/bugs/BUG-2718-the-approvals-record-page-reads-the-detail-response-envelope.md
A	docs/bugs/BUG-2732-attendance-integration-cannot-be-activated-activation-requir.md
A	docs/deployment/release-history/2026-08-31-production-6d17e93.md
A	docs/engineering-history/tasks/2026-08-31-session-redirect-loop-77abf947.md
A	docs/handoffs/2026-08-31-email-sink-visibility.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/knowledge/modules/leave-attendance-approvals.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-RUNTIME-039-the-approvals-inbox-shows-a-full-record-and-decides-through-.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-022-approvals.md
M	docs/qa/test-plans/index.md
M	docs/sessions/SESSION-0088-expired-session-redirect-loop-and-an-audit-of-buildscopedacc.md
A	docs/sessions/SESSION-0089-a-workspace-that-cannot-send-email-should-say-so.md
A	docs/sessions/SESSION-0090-approvals-inbox-make-the-decision-surface-real.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	services/api/src/common/guards/permissions.guard.ts
A	services/api/src/common/security/permission-evaluation.ts
A	services/api/src/modules/approvals/approval-decision.registry.ts
M	services/api/src/modules/approvals/approvals.controller.ts
A	services/api/src/modules/approvals/approvals.decision.spec.ts
M	services/api/src/modules/approvals/approvals.module.ts
M	services/api/src/modules/approvals/approvals.scope.spec.ts
M	services/api/src/modules/approvals/approvals.service.ts
M	services/api/src/modules/approvals/approvals.workflow.spec.ts
A	services/api/src/modules/approvals/dto/approval-decision.dto.ts
A	services/api/src/modules/attendance/attendance-approval.delegate.ts
M	services/api/src/modules/attendance/attendance.module.ts
A	services/api/src/modules/leave/leave-approval.delegate.ts
M	services/api/src/modules/leave/leave.module.ts
```

## Conflicts

One rebase, six files, all of them **generated-artifact** conflicts. `develop`
moved to `3f460e42` — another session's BUG-2732 record — while this branch's CI
ran, and that commit regenerated the same indexes this one did.

| File | What each side intended |
|---|---|
| `docs/backlog/index.md` | develop: add BUG-2732. here: add BUG-2718. |
| `docs/backlog/open.md` | the same pair. |
| `docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md` | recount open bugs. |
| `docs/knowledge/dashboards/DijiPeople Product Dashboard.md` | recount open bugs. |
| `docs/knowledge/dashboards/Engineering Control Center.md` | recount open bugs. |
| `docs/tasks/remediation/TASK-0005-inventory.json` | one inventory row each. |

No source file conflicted, and the regression register did not conflict on this
branch — REG-390 was the only entry appended here.

## Conflict Resolutions

Every one resolved by **taking develop's side wholesale and re-running the
generators**, committed as `60389593`.

What choosing the other side would have lost: this branch's copies predate
BUG-2732, so taking them would have deleted that record from every index while
leaving the record file itself on disk — an index disagreeing with the records it
indexes, which `rebuild-backlog.mjs --check` then fails in CI. Hand-merging the
hunks is worse: the result matches neither branch and is not what any generator
would produce, so the next `--check` fails on a file nobody edited.

The rule these are instances of: **a generated file has no authorial side.**
Resolve it by regenerating from the merged inputs, never by choosing text.

## QA

| | |
|---|---|
| **QA Report** | No separate run record. Verification is [[QA-RUNTIME-039]] — PASS for its automated steps; its one manual step is marked as manual there. |
| **Bug IDs** | [[BUG-2718]] — created and closed FIXED by this task. |
| **Backlog Items** | None. |

## CI

| | |
|---|---|
| **CI Run ID** | `33398928672`, on `d084dd7b` — the exact SHA ref-pushed to `develop`. |
| **CI Result** | PASS. Two earlier verdicts on this branch did not authorise anything; they are recorded below because they are instructive. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

`develop`'s tip is byte-identical to the validated task SHA, so the branch
evidence *is* the integrated evidence — which is the reason for ref-pushing
rather than merging.

Run on `d084dd7b`:

| Check | Result |
|---|---|
| `npm --workspace api run test` | 300 suites, 6,355 tests, all passing |
| `npm --workspace web run test` | 69 suites, 1,544 tests, all passing |
| `npm --workspace api run check-types` | pass |
| `npm --workspace web run check-types` | pass |
| eslint, api and web | 0 errors |
| all 14 scriptable Framework validation steps | pass |
| **API booted against a throwaway database** | `API is running`; both delegates registered; the three new routes mapped; the new POST answers 401 unauthenticated |

That last row is the one worth keeping. `wiring-invariants.spec.ts` is a static
reflection scan that never calls `NestFactory.create`, and every unit test
constructs services directly — so a DI cycle introduced by `AttendanceModule`'s
new `ApprovalsModule` import would have passed 6,355 tests and failed at boot, in
production. The throwaway database was dropped afterwards.

### Two CI verdicts that authorised nothing

- `72f30cfa` **FAILED** — `Framework validation`. `validate-framework.mjs` passed
  4,916 checks; the separate `generate-component-index.mjs --check` step failed,
  because extracting `buildApprovalRecord` into a new documented export took the
  index from 217 entries to 218. The reason for missing it: reading `ci.yml` with
  `grep -A 40`, which showed four of that job's sixteen steps.
- `60389593` **SUPERSEDED** — cancelled by the push of `72f30cfa`. Reported as
  superseded rather than failed, which is what `ci-evidence.mjs classify` is
  for.

## Release / Deployment Impact

Not deployed by this task. `main` is `UNTOUCHED` and production is where the task
found it, which is the terminal invariant for an ordinary task.

Rollback class: **revertible without data migration.** Nothing here writes a
schema or data change; the new endpoints are additive and the frontend change is
a projection. Reverting the commit restores the previous behaviour exactly,
disabled buttons included.

## Knowledge Capture

`docs/knowledge/modules/leave-attendance-approvals.md` — **corrected, not
rewritten.** Its section on this API stated correctly that the controller had two
GET routes, then judged: *"The Approve/Reject buttons on `/approvals` are declared
disabled. That is intended, not a defect."* The first half was fact; the second
was a judgement the owner overruled. The section now carries both — what it used
to say and why that changed — rather than being edited into having always been
right.

The durable lessons, recorded in the REG-390 register entry:

1. A generic inbox decides **through the module that owns the record**, never by
   moving its own row, wherever that row mirrors something authoritative.
2. Dispatching in-process skips the owning controller and therefore its guard, so
   the permission must be evaluated by the *same function* the guard calls — not
   a second copy of the rule.
3. A disabled control explains itself in terms of the record the user is looking
   at, not in terms of the runtime that renders it.

## Obsidian Sync

Ran. 18 notes written, 1,200 already current, 6 skipped as empty by the
empty-note policy. Folders touched: `Agent Knowledge/Bugs`,
`Agent Knowledge/QA Scenarios`, `Agent Knowledge/Modules`,
`Agent Knowledge/Engineering History` and the dashboards.

`knowledge:verify` reports zero parity, provenance, path, node-type, status,
semantic-link, duplicate and stale problems. Manual notes untouched — the script
writes only into the mapped agent-owned folders.

## Cleanup

Worktree removed with `node scripts/remove-worktree.mjs` — never
`git worktree remove`, which follows the `node_modules` junction and has
previously deleted thousands of tracked files out of the user's primary
checkout. This worktree carried a real `npm ci` rather than a junction, so that
hazard did not apply; the guard was used anyway, because the habit is the
protection.

Two throwaway databases were dropped: `dijipeople_boot_check` (the DI boot
verification above) and, on the sibling email task, `dijipeople_mail_mig`. The
populated `dijipeople` development database was never touched. The temporary
`services/api/.env` written for the boot check was deleted; it is gitignored and
was never staged.

`SESSION-0090` closed, its record set to `COMPLETE` by hand — `session.mjs
finish` prints a reminder and does not write that field.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-2718]] · [[BUG-2732]] · [[PLAN-022]] · [[QA-RUNTIME-039]] · [[SESSION-0088]] · [[SESSION-0089]] · [[SESSION-0090]] · [[TASK-0005]]

<!-- GRAPH:END -->
