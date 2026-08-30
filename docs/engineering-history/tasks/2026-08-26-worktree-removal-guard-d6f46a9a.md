# Engineering History — Worktree removal guard

| | |
|---|---|
| **Task Title** | Worktree removal guard |
| **Task Type** | FRAMEWORK — an incident fix and the guard that prevents its recurrence |
| **Date** | 2026-08-26 |
| **Architect Plan** | NOT_APPLICABLE — one new script, one npm entry, two documentation sections and nine validation checks. No schema, no API contract, no production data. |
| **Agents Used** | Integrator (primary — this is a Git-lifecycle defect), Reviewer, QA. **Not used:** Backend/API, Frontend, Database, Security — nothing in the product changed. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/worktree-removal-guard` |
| **Base SHA** | `6e67e063` — the SHA SESSION-0059 left `develop` at |
| **Final Task SHA** | `d6f46a9a14f976569410a13680a3c7de50a9079c` |
| **Target Branch** | `develop` — `main` untouched |
| **Merge Commit** | None — ref-push, so the tip is the verified SHA itself |
| **Final Target SHA** | `d6f46a9a14f976569410a13680a3c7de50a9079c` |

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
6e67e063 docs(admin-qa): close SESSION-0059 — history, session record, dashboards
d6f46a9a fix(scripts): stop a worktree delete reaching through a junction into the primary checkout
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
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-wtguard                            d6f46a9a [agent/worktree-removal-guard]
```

### Files Changed

52 file(s) against `origin/main`.

```
M	.agent/context/repository-health.md
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
A	docs/bugs/BUG-1494-git-worktree-remove-follows-node-modules-junctions-and-delet.md
M	docs/development/git-worktrees.md
M	docs/engineering-history/tasks/2026-08-25-landing-qa-fixes-309abe0d.md
A	docs/engineering-history/tasks/2026-08-26-admin-prod-e2e-qa-e7bd1e05.md
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
A	docs/qa/scenarios/QA-PLATFORM-027-removing-a-task-worktree-never-deletes-the-primary-checkout.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-012-deployment-release.md
M	docs/qa/test-plans/PLAN-019-platform-admin.md
M	docs/qa/test-plans/index.md
M	docs/sessions/SESSION-0057-fix-the-six-landing-qa-bugs-run-ui-ux-review-unblock-provisi.md
A	docs/sessions/SESSION-0058-dlp-investigator-review-on-the-employee-form.md
A	docs/sessions/SESSION-0059-admin-app-production-e2e-security-and-performance-qa.md
A	docs/sessions/SESSION-0060-guard-worktree-removal-against-destroying-the-primary-checko.md
M	docs/sessions/active.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
A	docs/tasks/TASK-0024-dlp-investigator-review-on-the-employee-record.md
M	docs/tasks/completed.md
M	docs/tasks/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	package.json
A	scripts/remove-worktree.mjs
M	scripts/validate-framework.mjs
M	services/api/src/modules/platform-runtime/platform-runtime.service.ts
A	services/api/src/modules/platform-runtime/platform-runtime.validate-contract.spec.ts
```

## Conflicts

None. The branch was cut from `6e67e063` and `develop` had not moved when it
landed, so the ref-push fast-forwarded.

## Conflict Resolutions

None required.

## QA

| | |
|---|---|
| **QA Report** | [`2026-08-26-admin-prod-e2e-8d6be21.md`](../../qa/runs/2026-08-26-admin-prod-e2e-8d6be21.md) — the run during whose cleanup the incident occurred |
| **Bug IDs** | BUG-1494 — created and FIXED here. |
| **Backlog Items** | None. |

## CI

| | |
|---|---|
| **CI Run ID** | `32945746835` |
| **CI Result** | **PASS**, read on `d6f46a9a` — the exact SHA pushed to `develop`. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

| Check | Result |
|---|---|
| `node scripts/validate-framework.mjs` | **3961 checks**, exit 0 |
| Mutation: delete the primary-worktree refusal | **1 check fails** |
| Mutation: swap `rmdirSync(link)` for a recursive delete | **2 checks fail** |
| Live fixture: worktree + junction to a 5-file canary | worktree removed, **all 5 files intact**, primary verified |

The live fixture matters more than the structural checks. Those assert the guard
*says* the right things; the fixture proves it *does* the right thing against the
exact shape that caused the damage.

The primary checkout was separately confirmed whole after repair: 4,472 tracked
files, `npm ci` complete, and `check-prisma-client-fresh` reporting 299 enums,
317 models and 7,392 fields reachable.

## Release / Deployment Impact

None — not deployed, and nothing here is deployable. The change is developer
tooling: a script, an npm entry, documentation and validation checks. No product
code is touched.

Rollback class: trivial. Reverting restores the previous documentation and
removes the guard; nothing depends on it at runtime.

## Knowledge Capture

The durable form is the guard itself plus BUG-1494, REG-262 and
QA-PLATFORM-027 — a script that refuses, checks that fail when the refusal is
removed, and a scenario anyone can re-run.

The generalisable lesson, worth more than the specific command: **two
individually safe practices composed into an unsafe one.** Junctioning
`node_modules` is established here and saves real minutes. `git worktree remove`
was the documented cleanup. Neither is wrong; the hazard lives in the seam,
because a junction is transparent to a recursive delete and npm workspaces makes
`node_modules` point back at the source tree. Nothing in either document
mentioned the other.

Second lesson, recorded in the register: the failure was **silent in the
direction that mattered.** Git's only complaint named the worktree as non-empty.
Nothing said the primary had been emptied. A destructive operation that reports
success — or reports an unrelated failure — is worse than one that errors, and
that is why the guard checks the primary *after* the delete rather than trusting
the exit code.

## Obsidian Sync

Not run — the vault configuration this environment lacks, as with SESSION-0059.
`knowledge:dashboards` regenerated all three dashboards and every record carries
its `GRAPH` block, so a later session with the vault configured can publish
without re-deriving anything.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/wt-wtguard` removed **using the guard this
task introduced** — `npm run worktree:remove` — which is the first real use of
it, and the appropriate one. Local branch deleted; the remote branch is left for
policy to reap.

Test fixtures removed: the throwaway worktree and both canary directories. The
guard correctly *refused* to remove the canaries, since they were plain
directories and not registered worktrees, so those were cleared by hand.

This worktree was deliberately created **without** a `node_modules` junction. It
needed no dependency resolution, and after what happened there was no reason to
reintroduce the hazard for convenience.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-1419]] · [[BUG-1420]] · [[BUG-1421]] · [[BUG-1422]] · [[BUG-1423]] · [[BUG-1424]] · [[BUG-1425]] · [[BUG-1494]] · [[ITEM-0101]] · [[PLAN-012]] · [[PLAN-019]] · [[QA-PLATFORM-023]] · [[QA-PLATFORM-024]] · [[QA-PLATFORM-025]] · [[QA-PLATFORM-026]] · [[QA-PLATFORM-027]] · [[SESSION-0057]] · [[SESSION-0058]] · [[SESSION-0059]] · [[SESSION-0060]] · [[TASK-0005]] · [[TASK-0024]]

<!-- GRAPH:END -->
