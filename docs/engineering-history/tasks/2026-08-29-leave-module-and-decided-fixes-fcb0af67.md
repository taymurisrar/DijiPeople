# Engineering History — Leave module and decided fixes

| | |
|---|---|
| **Task Title** | Leave module and decided fixes |
| **Task Type** | BUGFIX, with one FEATURE (leave entitlement allocation) |
| **Date** | 2026-08-29 |
| **Architect Plan** | `docs/plans/EXECPLAN-0026-leave-entitlement-allocation.md` (executed) and `EXECPLAN-0027-attendance-single-source-of-truth.md` (written, not executed) |
| **Agents Used** | Architect, Backend/API, Database, Frontend, QA, Reviewer, Integrator. **Not used:** Security — no new endpoint, permission key or tenant-scoping rule was introduced; the one authorization change (BUG-2015) narrowed an existing gate rather than widening it. Release/DevOps — nothing here deploys; the release itself is SESSION-0074's. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/web-shell-accessibility` |
| **Base SHA** | `70391242` at session start; rebased three times onto a moving `develop` |
| **Final Task SHA** | `fcb0af677e0ba20789270e61500b4c55619499c4` |
| **Target Branch** | `develop` — `main` was never touched (`MAIN_CHANGE_STATUS = UNTOUCHED`) |
| **Merge Commit** | None — integrated by ref-push, so `develop`'s tip equals the CI-verified SHA exactly |
| **Final Target SHA** | `fcb0af67` |

### Commits

Six commits reached `develop`, in four CI-verified integrations. The first four
kept their SHAs; the last two were rebased twice and carry post-rebase SHAs.

```
a86362cf fix(leave): approving a leave request required only permission to read it
bc507df7 fix(approvals): an unroutable chain now says which step and what to configure
9def9971 fix(web-runtime): a related-list create now carries its parent foreign key
f2d367d0 feat(leave): a policy entitlement now becomes a leave balance
273ed431 feat: three decided fixes -- audit toggle, seeded approval chain, leave backfill
4d10f62c docs(attendance): the owner's decision, and a plan that defers to SESSION-0072
fcb0af67 docs(leave): the refusal message reaches the screen after all
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            25dfd43a [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   fcb0af67 [agent/web-shell-accessibility]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
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
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

2 file(s) against `origin/main`.

```
M	docs/bugs/BUG-1968-leave-approval-routing-requires-an-active-reporting-manager-.md
M	docs/qa/scenarios/QA-RUNTIME-017-an-unroutable-approval-chain-refuses-the-submission-and-name.md
```

## Conflicts

Two rebases produced conflicts; a third was clean.

**Rebase 1 — onto `9f32c407` (SESSION-0072's work).** Eleven files:
`docs/backlog/{index,open,product-decisions}.md`, three dashboards,
`docs/qa/{coverage-matrix,scenarios/index,test-plans/index}.md`,
`docs/tasks/remediation/TASK-0005-inventory.json` — all **generated** — plus
`docs/qa/regressions/index.md`, which is **hand-maintained**, and later the three
attendance bug records.

The register conflict was a genuine **durable-id collision**: both sessions had
created `REG-307`, with different content. REG ids have no allocator, which is
the standing hazard `allocate-id.mjs` exists to prevent for every other record
type.

**Rebase 2 — onto `8c6b8496`.** Clean. **Rebase 3 — onto `25dfd43a`.** Clean.

<!-- the nine-type taxonomy: generated-artifact, durable-id, record-content,
     source-code, schema, lockfile, config, index, unclassified -->


taxonomy in [`.agent/agents/integrator.md`](../../../.agent/agents/integrator.md),
and what each side intended.

Write `None.` if the merge was clean. Do not omit the section.

## Conflict Resolutions

**Generated artifacts** — took `origin/develop`'s side wholesale and re-ran the
generators, rather than hand-merging hunks. Hand-merging produces an index that
matches neither branch and passes no validator.

**The id collision** — theirs landed on `develop` first and keeps `REG-307`. Mine
were renumbered to `REG-308` and `REG-309`, high-to-low so the first rename did
not cascade into the second, with every reference in five records updated.
Their `REG-307` had lost its `| **Active** | yes |` row to the conflict boundary,
because that line sat just outside the conflicted region and my insertion pushed
it onto the end of my last block. `backlog:rebuild` caught it — *"Status FIXED
requires RegressionId REG-307 to be active"* — and it was restored.

**The three attendance records** — taken from `origin/develop` **wholesale**, and
my own analysis discarded. SESSION-0072 was actively inside them and their
account was better sourced than mine: I had called the column defaults
"inverted" and inferred conflicting intentions; they traced it to `a8c04f16` and
`b984e570` and established the two values are logical complements always consumed
as complements. Only the owner's decision was re-applied on top, since that was
the one thing they did not have.

**A mistake worth recording.** Resolving rebase 1, I ran `git add -A` and it
staged *unresolved conflict markers* into those three records, which the rebase
then committed. `backlog:rebuild` refused them on the next run — *"line 12: not a
'Key: value' pair — <<<<<<< HEAD"* — and the commit was amended. `git add -A`
during a rebase stages conflicted files without complaint; `git diff --name-only
--diff-filter=U` should be checked first, every time.

<!-- what would have been lost if resolved the other way: -->


have been lost by choosing the other side**. This is the field a script cannot
fill and the reason this record is prose.

## QA

| | |
|---|---|
| **QA Report** | No new run record. Verification is per-record, in each bug's QA Retest section, and every one distinguishes what was tested from what was not. |
| **Bug IDs** | Closed: BUG-2015, BUG-1968, BUG-2011, BUG-1961, BUG-1967, BUG-2045. Created: BUG-2206. Corrected without closing: BUG-1979, BUG-1980, BUG-1981. |
| **Backlog Items** | Created and closed: ITEM-0113. |

## CI

| | |
|---|---|
| **CI Run ID** | 33247926356, 33250715820, 33254650713, 33255239533 — one per integration |
| **CI Result** | PASS on all four, each at the exact SHA that was then ref-pushed |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Against the final branch SHA before the last integration:

```
npm --workspace api run test          2050 passed, 250 suites
npm --workspace api run check-types    clean
npm --workspace api run lint           787 warnings, 0 errors (ratchet 789)
npm --workspace web  run test          39 passed (new spec)
npm --workspace web  run check-types    clean
npm run validate:framework             4463 checks
npm run backlog:check / qa:check        current
npm run knowledge:verify               OBSIDIAN_SYNC_STATUS = PASS
```

**The lint ratchet nearly failed CI.** The first draft of
`timesheet-job-audit.spec.ts` reached a private method through an `any` and added
twelve warnings, taking the count to 799 against a limit of 789. Rewriting it
with a declared internals interface brought it back to 787. A green local test
run said nothing about this.

Every new guard was **mutation-tested** — the fix reverted, the test observed to
fail, the fix restored:

| Guard | Reverted to | Result |
|---|---|---|
| `leave-approval-permissions` | the `read` decorators | 3 of 6 fail |
| `approval-matrix-resolver` (BUG-1968) | fail-fast `throw` | 3 of 4 fail |
| `related-record-parent-key` | `!input.subgrid.api` | body assertion fails |
| `leave-entitlement` | resolve once, not per employee | 1 of 6 fails |
| `default-approval-matrices` | the shipped chain | 3 of 8 fail |

The entitlement row is the informative one: the naive implementation passes five
of six. Only the test written to pin the design decision catches it.

<!-- verbatim results above -->


results. Tests that passed on the task branch prove the branch, not the
integrated result.

## Release / Deployment Impact

Nothing in **this task** deploys. `MAIN_CHANGE_STATUS = UNTOUCHED` — this session
never wrote to `main`.

**It shipped anyway, during this session.** SESSION-0074 promoted `develop` to
`main` at `6d17989a` while this record was being written. The hazard flagged here
— that session holding `BASE_SHA: 25dfd43a`, predating this work — did not
materialise: it promoted a later `develop`, and every substantive commit above is
an ancestor of `origin/main`. Only `fcb0af67`, a documentation correction, missed
the cut and stays on `develop` for the next release.

That also means `DEVELOP_CONTAINS_MAIN` now fails: the release merge commit
exists on `main` and not on `develop`. Reconciling it is the release owner's
closing step and belongs to SESSION-0074, which was still in flight. It was
deliberately not done here rather than raced — the same judgement that produced
three clean rebases earlier in this task.

A release plan was written for the repository owner covering what ships, the
one-way `20260829090000_identity_contract` migration, the deploy sequence and the
operator steps. `ROLLBACK_CLASS` for this task alone is `CODE_ONLY`; the release
as a whole is not, because of that migration.

The **leave entitlement backfill** (`npm --workspace api run
backfill:leave-entitlement`) is an operator step that must run after deploy. It
reuses `LeaveEntitlementService`, so the code ships first — it cannot run before.
It was verified against a throwaway database: fixture in the pre-fix state,
`--dry-run`, real run, second real run; `totalAllocated 20 / totalUsed 3 /
totalRemaining 17`, identical after re-running. The database was dropped and the
populated development database was never touched.

<!-- rollback class and environment above -->


and the release record if one exists. `None — not deployed.` is a complete
answer.

## Knowledge Capture

Five regression entries — REG-304 through REG-306, and REG-308/309 after the
collision rename — each naming the bug class, the guard, and what was proven to
fail without the fix.

Three QA test plans were **created**, all for areas that had none:
[[PLAN-022]] (approvals), [[PLAN-023]] (leave), and the scenarios under
[[PLAN-021]] (settings). Each was raised the same way [[PLAN-021]] itself was —
`rebuild-qa` refusing a regression with *"a scenario outside every plan is never
selected for a re-run"*. Three times in one session is a signal about coverage,
not about the validator.

Five QA scenarios: QA-AUTHZ-013, QA-RUNTIME-017, QA-RUNTIME-020, QA-RUNTIME-021,
QA-RUNTIME-022, QA-SETTINGS-005.

<!-- knowledge files above -->


categories. "Nothing durable was learned" is a valid outcome; record it as one.

## Obsidian Sync

Ran after every commit and re-ran after each rebase, because a rebase leaves the
vault describing a tree that no longer exists. Final state
`OBSIDIAN_SYNC_STATUS = PASS`.

One intermediate `ORPHAN_GENERATED_NODE` — an engineering-history note from
SESSION-0073 with no source in *this branch*. It was left alone rather than
deleted, on the standing rule that orphans are usually another session's live
work. That call was correct: it resolved by itself once the branch was rebased
onto a `develop` that contained the source. Deleting it would have destroyed a
record another session had just written.

<!-- generated folders above -->


folders changed.

## Cleanup

The worktree `dijipeople-admin-fx` is retained — it is a long-lived checkout
shared across sessions, not a per-task worktree.

**Three remote branches remain and are deliberate.** Force-push is blocked in
this environment, so each rebase needed a fresh ref to get a CI verdict:
`agent/leave-module-and-decided-fixes`, `agent/leave-module-decided-fixes-r2`,
`agent/leave-refusal-visibility-note`. All their content is on `develop`. They
were left for the repository owner to delete rather than removed unasked, since
deleting a remote ref is outward-facing.

**Primary worktree:** `DIRTY_OTHER_SESSION_OWNED`. Two paths, both explained and
neither this session's — `.mcp.json`, already modified before this task began,
and SESSION-0074's own session record. `UNEXPLAINED_DIRTY_FILES = 0`.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-1961]] · [[BUG-1967]] · [[BUG-1968]] · [[BUG-1979]] · [[BUG-1980]] · [[BUG-1981]] · [[BUG-2011]] · [[BUG-2015]] · [[BUG-2045]] · [[BUG-2206]] · [[EXECPLAN-0026]] · [[EXECPLAN-0027]] · [[ITEM-0113]] · [[PLAN-021]] · [[PLAN-022]] · [[PLAN-023]] · [[QA-AUTHZ-013]] · [[QA-RUNTIME-017]] · [[QA-RUNTIME-020]] · [[QA-RUNTIME-021]] · [[QA-RUNTIME-022]] · [[QA-SETTINGS-005]] · [[SESSION-0072]] · [[SESSION-0073]] · [[SESSION-0074]] · [[TASK-0005]]

<!-- GRAPH:END -->
