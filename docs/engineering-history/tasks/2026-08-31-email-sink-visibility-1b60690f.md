# Engineering History — Email sink visibility

| | |
|---|---|
| **Task Title** | Email sink visibility |
| **Task Type** | BUGFIX, with a MIGRATION — one additive enum value. Picked up from a written handoff rather than raised fresh. |
| **Date** | 2026-08-31 |
| **Architect Plan** | NOT_APPLICABLE — the design was already decided in [`docs/handoffs/2026-08-31-email-sink-visibility.md`](../../handoffs/2026-08-31-email-sink-visibility.md), and the schema change is a single additive enum value, which `PLANS.md` does not class as destructive. |
| **Agents Used** | Architect, Backend/API, Frontend, Database, QA, Reviewer, Integrator, Knowledge & Graph. **Security was not used**: nothing here changes an authorization decision — the one new endpoint reads a boolean and a provider type name, exposes no configuration and no credential, and is gated to match the route that creates a schedule. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/email-sink-visibility` |
| **Base SHA** | `6d17e931ba46aac50194cc455eeb3846a8840af8` |
| **Final Task SHA** | `1b60690f20e213a3252dc8fe17727b0248ca192c` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — integrated by ref-push (`git push origin agent/email-sink-visibility:develop`), so `develop`'s tip *is* the CI-verified commit. |
| **Final Target SHA** | `1b60690f20e213a3252dc8fe17727b0248ca192c` — identical to the Final Task SHA. |

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
a9bd8939 fix(notifications): a workspace that cannot send email now says so
1b60690f chore(records): regenerate indexes after rebasing onto develop
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            c22889ab [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-approvals                  9d6e2cc7 [agent/approvals-inbox-decisions]
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

73 file(s) against `origin/main`.

```
M	.agent/context/component-index.md
M	apps/web/app/(authenticated)/approvals/[approvalId]/page.tsx
M	apps/web/app/(authenticated)/approvals/page.tsx
A	apps/web/app/(authenticated)/reports/_components/delivery-capability-notice.tsx
M	apps/web/app/(authenticated)/reports/_components/schedule-report-dialog.tsx
M	apps/web/app/(authenticated)/reports/_lib/reporting-browser.ts
M	apps/web/app/(authenticated)/reports/_lib/reporting-server.ts
M	apps/web/app/(authenticated)/reports/scheduled/page.tsx
M	apps/web/app/api/approvals/[...path]/route.ts
A	apps/web/app/components/approvals/approval-chain.tsx
A	apps/web/app/components/approvals/approval-display.ts
A	apps/web/app/components/approvals/approval-record.ts
M	apps/web/app/components/approvals/approval-types.ts
M	apps/web/lib/runtime/command-payload-schema.ts
A	apps/web/lib/runtime/modules/approval-decision-commands.spec.ts
M	apps/web/lib/runtime/modules/standard-module-data.adapter.ts
M	apps/web/lib/runtime/modules/standard-module-specs.ts
M	docs/backlog/deferred.md
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0120-schema-prisma-declares-constraints-no-migration-creates-so-m.md
M	docs/backlog/open.md
A	docs/bugs/BUG-2718-the-approvals-record-page-reads-the-detail-response-envelope.md
A	docs/bugs/BUG-2732-attendance-integration-cannot-be-activated-activation-requir.md
A	docs/bugs/BUG-2741-a-workspace-whose-email-provider-is-a-sink-reports-every-mes.md
A	docs/deployment/release-history/2026-08-31-production-6d17e93.md
A	docs/engineering-history/tasks/2026-08-31-session-redirect-loop-77abf947.md
A	docs/handoffs/2026-08-31-email-sink-visibility.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/knowledge/modules/leave-attendance-approvals.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-REPORTING-011-a-workspace-that-cannot-send-email-says-so-before-a-schedule.md
A	docs/qa/scenarios/QA-RUNTIME-039-the-approvals-inbox-shows-a-full-record-and-decides-through-.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-022-approvals.md
M	docs/qa/test-plans/PLAN-034-reports.md
M	docs/qa/test-plans/index.md
M	docs/sessions/SESSION-0088-expired-session-redirect-loop-and-an-audit-of-buildscopedacc.md
A	docs/sessions/SESSION-0089-a-workspace-that-cannot-send-email-should-say-so.md
A	docs/sessions/SESSION-0090-approvals-inbox-make-the-decision-surface-real.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
A	services/api/prisma/migrations/20260831140000_email_delivery_not_delivered_status/migration.sql
M	services/api/prisma/schema.prisma
M	services/api/src/common/guards/permissions.guard.ts
A	services/api/src/common/security/permission-evaluation.ts
A	services/api/src/log-level-resolution.spec.ts
A	services/api/src/log-level.ts
M	services/api/src/main.ts
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
A	services/api/src/modules/notifications/email/email-delivery-capability.spec.ts
M	services/api/src/modules/notifications/email/email-execution.service.ts
M	services/api/src/modules/notifications/email/email-provider-factory.service.ts
A	services/api/src/modules/notifications/email/email-sink-delivery-status.spec.ts
A	services/api/src/modules/notifications/email/email-sink-visibility.spec.ts
M	services/api/src/modules/notifications/email/providers.ts
M	services/api/src/modules/reporting/reporting.controller.ts
M	services/api/src/modules/reporting/schedule/report-schedule.service.ts
```

## Conflicts

One rebase, seven files, onto the `develop` that the sibling approvals task
(BUG-2718) had just landed on.

Six were **generated-artifact** conflicts of the ordinary kind — the component
index, the two backlog indexes, two dashboards and the remediation inventory —
each side adding its own record.

The seventh was not, and is the one worth writing down:
`docs/qa/regressions/index.md` is **hand-maintained**. REG-390 (approvals,
already on develop) and REG-391 (this branch) are both appended at the end of
the same file, so the two sides overlap on the file's tail. Git placed the
`=======` boundary such that REG-390's closing `| **Active** | yes |` row fell
*outside* the conflict, on the shared trailing line — so **either one-sided
resolution silently deletes it**, and the diff looks complete.

## Conflict Resolutions

The six generated files: develop's side taken wholesale, then every generator
re-run, committed as `1b60690f`. Choosing this branch's copies would have erased
BUG-2718 and QA-RUNTIME-039 from every index while their record files stayed on
disk, which `rebuild-backlog.mjs --check` rejects. A generated file has no
authorial side; it is regenerated from the merged inputs, never chosen.

The regression register: **both entries kept**, in id order, and REG-390's
stripped `| **Active** | yes |` row restored by hand.

What choosing either side would have lost is the whole point. Taking ours drops
REG-391 — this branch's own work, obviously wrong. Taking theirs drops REG-390
— another task's already-integrated entry, and `backlog:rebuild` would then have
refused BUG-2718 with *"Status FIXED requires RegressionId REG-390 to be
active"*, pointing at a record nobody had touched.

Neither is what a careless resolution produces, though. The realistic failure is
the one that happened on 2026-08-19: keep both entry bodies, lose the shared
trailing line, and end up with a register where REG-390 is silently no longer
active. That reads as a clean merge.

Verified by counting rather than by looking: the register now holds **295**
`Active | yes` rows against develop's **294**, which is exactly the one this
branch adds.

## QA

| | |
|---|---|
| **QA Report** | No separate run record. Verification is [[QA-REPORTING-011]] — PASS for its automated steps; the two UI steps and the negative case are marked manual there. |
| **Bug IDs** | [[BUG-2741]] — created and closed FIXED by this task. |
| **Backlog Items** | [[ITEM-0120]] — created, DEFERRED. Pre-existing schema/migration drift found while producing this task's migration; unrelated to it, and its safe resolution needs production duplicate counts. |

## CI

| | |
|---|---|
| **CI Run ID** | `33400886633`, on `1b60690f` — the exact SHA ref-pushed to `develop`. |
| **CI Result** | PASS, first attempt. All sixteen Framework validation steps were run locally before pushing, after the sibling task lost a cycle to running four of them. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

`develop`'s tip is byte-identical to the validated task SHA, so the branch
evidence is the integrated evidence.

Run on `1b60690f`, **after** the rebase onto the approvals work — so these
numbers cover both tasks together, which is the combination nothing had tested
before:

| Check | Result |
|---|---|
| `npm --workspace api run test` | 304 suites, 6,378 tests, all passing |
| `npm --workspace web run test` | 69 suites, 1,544 tests, all passing |
| `npm --workspace api run check-types` | pass |
| `npm --workspace web run check-types` | pass |
| eslint, api and web | 0 errors |
| all 14 scriptable Framework validation steps | pass |

Each behavioural fix was additionally **proven to fail without it**, by reverting
the change and watching the test go red:

| Reverted to | Went red |
|---|---|
| unconditional `SENT` on a successful send | 3 of 4 delivery-status cases; the SMTP case stayed green, which is correct |
| capability ignoring sinks | both sink cases; the SMTP and platform-relay cases stayed green |
| `info` alias and the unrecognised-value warning removed | both log-level cases |

The migration itself was verified by applying it: a throwaway database carrying
all 225 prior migrations, `migrate deploy`, then reading the enum back from
`pg_enum` — `…,DRY_RUN,NOT_DELIVERED`. Database dropped afterwards.

## Release / Deployment Impact

Not deployed by this task; `main` is `UNTOUCHED`. The handoff's definition of
done asks for production, and the owner directed that both this and the sibling
approvals task go to `develop` first and be promoted together — so the release
and its verification belong to that release record, not to this one.

Rollback class: **forward-only schema, revertible code.** The migration adds one
enum value and nothing else; reverting the code leaves `NOT_DELIVERED` defined
and unused, which is inert. Do **not** attempt to drop the enum value to roll
back — PostgreSQL cannot remove one, and rows may already carry it.

One deployment note that matters more than usual here: Render captures a
deploy's environment when the deploy is *created*, not when the container
starts, and `render.yaml` is not synced to this service. If `LOG_LEVEL` is to be
corrected from `info`, the change must precede the deploy that should pick it
up — though after this task `info` is honoured rather than silently discarded,
so the correction is no longer urgent.

## Knowledge Capture

No `docs/knowledge/` module note needed rewriting — the notifications note did
not make a claim this change falsifies. The durable material is in the REG-391
register entry and in [[BUG-2741]], and it is three things:

1. **A pipeline reporting success is not evidence the artifact exists.** The
   schedule said COMPLETED, the delivery log said SENT with a plausible message
   id, and the subject line had rendered correctly. Every layer was truthful
   about its own step and the whole was false.
2. **Do not overload an existing status to avoid a migration.** `DRY_RUN` means
   the caller asked for a rehearsal and `SKIPPED` means the send was suppressed
   before a provider was reached; reusing either for "this workspace cannot
   deliver" would have made all three unreadable.
3. **Resolve a capability through the path the real operation takes.** The send
   path slots the platform relay between the tenant's providers and the
   environment fallback, so a check reading the tenant's own rows would tell
   every tenant on the platform relay that it cannot send.

A fourth, smaller: the new "not delivered" line is logged at `warn`, not `log`,
because production resolves to error and warn only. Reporting the discovery of
silent logging at a silenced level would have repeated the bug.

## Obsidian Sync

Ran, and `knowledge:verify` returns `OBSIDIAN_SYNC_STATUS = PASS` — every mapped
note exists, carries substance, matches its source, and every generated wikilink
resolves. Folders touched: `Agent Knowledge/Bugs`, `Agent Knowledge/Backlog`,
`Agent Knowledge/QA Scenarios`, `Agent Knowledge/Engineering History` and the
dashboards. Manual notes untouched.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-mail` removed with
`node scripts/remove-worktree.mjs`, never `git worktree remove`.

That distinction earned its place here. This worktree's `node_modules` began as
a junction into the user's primary checkout, and the handoff was explicit that a
trustworthy test run needed a real install. It was unlinked with
`[IO.Directory]::Delete(path, $false)` — which removes the junction without
following it — and the primary's `node_modules` was counted before and after to
prove nothing had been deleted through it: 940 entries both times. A recursive
delete there has previously destroyed 3,072 tracked files out of the user's
workspace.

`dijipeople_mail_mig`, the throwaway database used to generate and verify the
migration, was dropped. The populated `dijipeople` development database was never
touched — the handoff named that as the thing not to touch, and it was not.

`SESSION-0089` closed and its record set to `COMPLETE` by hand.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-2718]] · [[BUG-2732]] · [[BUG-2741]] · [[ITEM-0120]] · [[PLAN-022]] · [[PLAN-034]] · [[QA-REPORTING-011]] · [[QA-RUNTIME-039]] · [[SESSION-0088]] · [[SESSION-0089]] · [[SESSION-0090]] · [[TASK-0005]]

<!-- GRAPH:END -->
