# Engineering History — Workspace switcher avatar menu

| | |
|---|---|
| **Task Title** | Workspace switcher avatar menu |
| **Task Type** | UI/UX — a `DP:` prompt with no keyword; the Architect inferred `UI` + `UX` from the description |
| **Date** | 2026-08-29 |
| **Architect Plan** | NOT_APPLICABLE — SMALL and single-surface. No schema, migration, permission or contract change, so `PLANS.md` requires an ExecPlan for none of the classes this touches. |
| **Agents Used** | Architect, Frontend, UI/UX, QA, Reviewer, Integrator, Product & Backlog Steward, Knowledge & Graph. **Deliberately not used:** Backend/API and Database (no API or schema change — the switcher's endpoint is untouched), Security (no auth, permission, tenant-scope or input-validation surface changed), Release/DevOps (targets `develop`; `main` untouched). |

## Git

| | |
|---|---|
| **Base Branch** | `3fff9cc9` |
| **Task Branch** | `agent/workspace-switcher-avatar-menu` |
| **Base SHA** | `3fff9cc9dc3409d5ce50d0057d004fba3a9cf420` |
| **Final Task SHA** | `9f32c40722704ab86429f29a099402aefde2ecd9` |
| **Target Branch** | `develop` |
| **Merge Commit** | none — integrated by ref-push (`git push origin HEAD:develop`), so `develop`'s tip *is* the CI-verified SHA rather than a merge commit over it |
| **Final Target SHA** | `9f32c40722704ab86429f29a099402aefde2ecd9` |

### Commits

```
9991ba87 fix(web): the workspace switcher moves under the avatar, and names itself once
ff779ec9 docs(backlog): three findings from the screenshots that asked for ITEM-0102
9f32c407 chore(indexes): regenerate after the second rebase onto develop
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            70391242 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   7af240cd [agent/web-shell-accessibility]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-blockers                   48a122af [agent/starter-blocker-fixes]
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
D:/My Work/hrm-dijipeople/wt-workspace-menu                     9f32c407 [agent/workspace-switcher-avatar-menu]
```

### Files Changed

26 file(s) against `3fff9cc9`.

```
M	.agent/context/component-index.md
M	apps/web/app/(authenticated)/_components/dashboard-topbar.tsx
M	apps/web/app/(authenticated)/_components/user-menu-dropdown.tsx
M	apps/web/app/(authenticated)/layout.tsx
A	apps/web/app/components/workspace-switcher-placement.spec.ts
M	apps/web/app/components/workspace-switcher.tsx
M	docs/backlog/completed.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
M	docs/backlog/items/ITEM-0102-move-switch-workspace-into-the-avatar-menu.md
A	docs/backlog/items/ITEM-0114-the-workspace-shell-states-the-tenant-s-identity-four-times-.md
M	docs/backlog/product-decisions.md
A	docs/bugs/BUG-2148-dashboard-widget-severity-is-conveyed-by-colour-alone-and-hi.md
A	docs/bugs/BUG-2149-every-dashboard-metric-card-offers-a-link-named-only-open.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
A	docs/qa/scenarios/QA-TENANT-054-switching-workspace-is-reached-from-the-avatar-menu-and-name.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-011-runtime-modules.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0073-move-switch-workspace-into-the-avatar-menu-item-0102.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
```

## Conflicts

**Two rebases, both against a moving `develop`, and every conflict was in a
generated file.** No source file conflicted at any point.

**Rebase 1** — `develop` had gained three commits while this branch sat in CI
(`bc507df7`, `9def9971`, `f2d367d0`). Eight conflicts, spread across two of the
three commits being replayed. Type: **generated-artifact conflict** in every
case.

| File | What each side intended |
|---|---|
| `docs/backlog/index.md` | origin: three new bug records from the leave work · ours: `ITEM-0102` moving to `DONE` and three new records |
| `docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md` | both: a recount of open/deferred/product-decision totals |
| `docs/knowledge/dashboards/Engineering Control Center.md` | both: the same recount |
| `docs/qa/coverage-matrix.md` | origin: new scenarios for leave and approvals · ours: `QA-TENANT-054` |
| `docs/qa/scenarios/index.md` | as above |
| `docs/qa/test-plans/index.md` | as above |
| `docs/qa/test-plans/PLAN-011-runtime-modules.md` | both: a regenerated graph block listing the plan's scenarios |
| `docs/tasks/remediation/TASK-0005-inventory.json` | origin: rows for its records · ours: rows for `BUG-2148`, `BUG-2149`, `ITEM-0114` |

**Rebase 2** — `develop` moved *again* while rebase 1's result was in CI
(`3fff9cc9`). Same class, same files, plus `docs/sessions/index.md` and
`docs/sessions/active.md` — origin closing its session while ours opened
`SESSION-0073`.

Every one is the same shape: two branches appending different rows to a file
neither maintains by hand.

## Conflict Resolutions

**Every conflict resolved by taking `origin`'s side wholesale, then re-running
the generator against the merged records.** Not by merging the hunks.

What choosing the other side would have cost: a generated index hand-merged from
two branches matches the records of *neither*. Both halves would be present and
the file would still be wrong — wrong counts, wrong ordering, stale rows — and
it would fail `rebuild-*.mjs --check` on CI while looking perfectly reasonable
in the diff. Taking one side and regenerating is the only resolution that
produces a file the generator would itself have written.

Nothing was lost by discarding this branch's side, because this branch's side
was output, not input. The records that *produce* it — `ITEM-0102`, `BUG-2148`,
`BUG-2149`, `ITEM-0114`, `QA-TENANT-054` — never conflicted, and each was
verified present by name after both rebases rather than assumed.

**Two of this branch's four commits vanished as empty during rebase 2**
(`70cf5e8c` and `802f9572`, both index regenerations). That is the correct
outcome and not a loss: their entire content was generated output, and it has
been regenerated since. The two commits carrying actual work replayed cleanly.

## QA

| | |
|---|---|
| **QA Report** | None — the durable coverage is `QA-TENANT-054` plus its automated test. A run record narrating one unit suite would add nothing the scenario does not already state. |
| **Bug IDs** | Created: `BUG-2148` (MEDIUM, `DEFER`), `BUG-2149` (LOW, `DEFER`) — both from the screenshot review, both triaged, neither fixed here. Closed: none. |
| **Backlog Items** | Closed: `ITEM-0102` (`DEFERRED` → `DONE`). Created: `ITEM-0114` (`PRODUCT_DECISION`). Scenario `QA-TENANT-054` created and linked from `ITEM-0102`. |

## CI

| | |
|---|---|
| **CI Run ID** | `33252199144`, on `9f32c407` — the exact SHA pushed to `develop`. Earlier runs on this branch, none of which authorised anything: `33249763706` CANCELLED (superseded by a second push), `33250200517` FAILED (stale component index), `33250826648` PASS on `1e31d7de` and `33251454032` PASS on `802f9572`, both SHAs rebased away before integration. |
| **CI Result** | PASS |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run in the task worktree at `9f32c407`, which is byte-identical to `develop`'s
tip because integration was a ref-push rather than a merge — there is no merge
commit whose result could differ from what was tested.

| Command | Result |
|---|---|
| `npm --workspace web run test` | PASS — 32 suites, 941 tests |
| `npm --workspace web run check-types` | PASS |
| `npm --workspace web run lint` | PASS — 0 errors, 26 warnings, all pre-existing and none in a file this task touched |
| `node scripts/validate-framework.mjs` | PASS — 4,454 checks |
| `node scripts/generate-component-index.mjs --check` | PASS |
| `node scripts/rebuild-backlog.mjs --check` | PASS |
| `node scripts/rebuild-qa.mjs --check` | PASS |
| `node scripts/rebuild-sessions.mjs --check` | PASS |
| `node scripts/rebuild-tasks.mjs --check` | PASS |
| `node scripts/generate-dashboards.mjs --check` | PASS |
| the four `node --test scripts/*.test.mjs` steps | PASS |

**Not run, and why.** `npm --workspace api run test` and the API e2e suites —
nothing under `services/api` was touched. `npm run build` — no build input
changed. `npm run db:preflight` — no schema, migration or database-backed query
changed. `npm run prisma:*` — no Prisma surface touched.

**Not verified in a browser.** The Playwright MCP server timed out connecting
this session (`CONNECT_TIMEOUT` after 30s), so the visual half of
`QA-TENANT-054` is unrun. It needs a genuinely multi-workspace account in any
case, which `dijipeople-demo` does not have — the switcher renders `null` there
by design. The placement assertions are source-level for that reason, and the
scenario says so rather than implying a visual confirmation that did not happen.

## Release / Deployment Impact

Reaches no environment by this task. Ordinary task, target `develop`, `main`
untouched — `MAIN_CHANGE_STATUS = UNTOUCHED`. No release record.

**Rollback class: trivial.** Four files under `apps/web`, no schema, no
migration, no API contract, no permission key, no settings key, no environment
variable. Reverting the commit restores the previous placement exactly. Nothing
persists state a revert would strand, and no other app or the gateway consumes
any of it.

It reaches production whenever the owner next promotes `develop` to `main`,
which is their call and not this task's.

## Knowledge Capture

- `docs/knowledge/implementations/2026-08-29-workspace-switcher-avatar-menu.md`
  — **new**, category `UI_CHANGE`. What shipped, and specifically why the slot
  pattern was forced by the server/client boundary rather than chosen.
- `docs/knowledge/modules/tenant-application.md` — **updated in place**, one new
  entry under *Traps that have caused real defects*: a server-rendered node
  handed to a client component is truthy even when it resolved to `null`, so
  anything conditional on the slot's presence has to be drawn by the slot. The
  *Known records* list also gained `ITEM-0102`, `ITEM-0114`, `BUG-2148` and
  `BUG-2149`.

The trap is the part worth retrieving later. The implementation note is history;
the trap is what a future agent adding a second slot to this menu would
otherwise get wrong.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran: **72 notes written, 948 already current,
6 skipped as empty.** The folders this task's own writes landed in:

- `06 - Implementation Plans/Generated` — the new implementation note
- `03 - Modules/Generated` — the updated `tenant-application` note
- `07 - Bugs/Generated` — `BUG-2148`, `BUG-2149`
- `04 - Requirements/Generated` / backlog — `ITEM-0102`, `ITEM-0114`
- `11 - Agent Knowledge/QA/Scenarios` — `QA-TENANT-054`
- `00 - Home/Generated` — the regenerated dashboards

**`OBSIDIAN_SYNC_STATUS = COMPLETE_WITH_DOCUMENTATION_WARNING.`**
`knowledge:verify` reports clean on everything this task produced —
`OBSIDIAN_GRAPH_ORPHANS 0`, `OBSIDIAN_STALE_GENERATED 0`,
`OBSIDIAN_PARITY_DIFFS 0`, `OBSIDIAN_MISSING_PROVENANCE 0` — and four
`ORPHAN_GENERATED_NODE` findings that are **not this task's**:

| Vault note | Source lives on |
|---|---|
| `BUG-2206-three-timesheet-audit-toggles-render-on-screen-and-are-read-` | `agent/web-shell-accessibility` @ `7af240cd` |
| `QA-RUNTIME-022-a-freshly-provisioned-tenant-can-route-an-approval-without-c` | `agent/web-shell-accessibility` @ `7af240cd` |
| `QA-SETTINGS-005-a-settings-toggle-that-is-turned-off-changes-behaviour` | `agent/web-shell-accessibility` @ `7af240cd` |
| `EXECPLAN-0027-attendance-single-source-of-truth` | `agent/web-shell-accessibility` @ `cd1c1fd6` |

The vault is not branch-aware: it holds the union of what every session has
synced, while `knowledge:verify` looks for sources on the branch it is run from.
All four belong to SESSION-0071, which is still `ACTIVE`. Each was traced with
`git log --all --diff-filter=A` before being classified, rather than assumed.

**Nothing was deleted.** "Remove the generated copy" is the wrong remedy here —
it would delete a live session's published work to make this task's verification
read green.

## Cleanup

- **Task worktree** `D:/My Work/hrm-dijipeople/wt-workspace-menu` — removed with
  `npm run worktree:remove` as the last step, after this record is integrated.
  Never `git worktree remove`: it follows the `node_modules` junctions into the
  primary checkout, which has previously deleted 3,072 tracked files out of the
  user's workspace.
- **`node_modules` junctions** — two, at the worktree root and `apps/web`, both
  pointing into the primary checkout. The guard is what handles these safely.
- **Local branch** `agent/workspace-switcher-avatar-menu` — kept until the
  worktree is gone, then deleted. Its commits are on `develop`; the remote
  branch stays for the audit trail.
- **Primary checkout** `D:/My Work/hrm-dijipeople/DijiPeople` — untouched
  throughout. It carried exactly one dirty path at PRE_TASK_REPO_HEALTH,
  `.mcp.json`, which was not this task's and was not staged, committed or
  reverted. `PRIMARY_WORKTREE_STATUS = DIRTY_USER_OWNED`, and that one path is
  the whole of it.
- **Session** `SESSION-0073` — finished and set to `STATUS: COMPLETE`. Left
  `ACTIVE`, the next session on this branch fails its own validation.
- **Write leases** — none were taken. The task wrote no schema, no migration, no
  runtime registry and no seed; `session.mjs check` classified it
  `SAFE_PARALLEL` against four other live sessions and it stayed that way.
- **Merge queue** — `agent/workspace-switcher-avatar-menu` was queued before the
  first integration attempt and is released by `session.mjs finish`.
