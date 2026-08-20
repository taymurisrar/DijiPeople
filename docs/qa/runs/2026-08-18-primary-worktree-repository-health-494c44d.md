# QA Run — primary-worktree-repository-health

## Metadata

| | |
|---|---|
| Date / time | 2026-08-19T00:00Z |
| Branch | `agent/repo-health-primary-worktree` |
| Commit SHA | `494c44de866a885c083084d81303fa3707b48002` (base) |
| Worktree | `D:/My Work/hrm-dijipeople/dijipeople-repo-health` |
| Environment | Node 24, no database, no external services — none required. The task worktree was dirty with this task's own uncommitted changes throughout; that is the change under test, and every simulation runs against its own throwaway repository, not this one. |
| QA agent | qa |
| Scope | `scripts/repo-health.mjs`, `scripts/session.mjs`, and the framework contract documents that describe them. **Not** covered: any product surface, any database behaviour, deployment. |

## Requirement

Repository health must be a property of every framework-managed worktree rather
than of the one the check is invoked from, so that a task cannot report
`CLEANUP_STATUS = DONE` while the user's primary checkout carries uncommitted
files nobody can account for. See [[BUG-0076]]. No ExecPlan — the change extends
`repo-health.mjs` rather than introducing a new mechanism.

## Risk Areas

- **Destroying somebody else's work.** The obvious wrong fix is to make
  `git status` empty. Another live session's records and the user's own
  in-flight edits must survive untouched. Highest risk in this change.
- **A diagnostic that mutates.** `repo-health.mjs` is required to report only.
  A regression here would let a health check reconcile a wrong diagnosis.
- **False positives.** A blocker that fires on ordinary state gets ignored, and
  then the real one is ignored too — the `MAIN_CHANGE_STATUS` lesson recorded in
  that field's own comment.
- **Decorative checks.** The `doc-code-drift` and "validation must be
  mutation-tested" patterns both apply: the defect under repair was code that
  computed a value and discarded it, which every structural check passed.

## Scenarios

Expected behaviour written before execution — see
[[QA-DEPLOY-015]] for the durable form.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Unexplained dirty file in the primary checkout, task worktree clean | UNIT | `PRIMARY_WORKTREE_STATUS = DIRTY_UNEXPLAINED`, `TASK_WORKTREE_STATUS = CLEAN` | PASS | simulation 37A |
| S2 | The same file appears in `blockers`, not `warnings` | UNIT | a blocker matching `/unexplained/i` | PASS | simulation 37A |
| S3 | The unexplained path is named with `owner: UNKNOWN` | UNIT | `unexplainedDirtyFiles[].path` present | PASS | simulation 37A |
| S4 | Path proven pre-existing by `--primary-baseline` | UNIT | `DIRTY_USER_OWNED`, not blocking | PASS | simulation 37B |
| S5 | The user's file is still on disk, unmodified, after the run | UNIT | content intact | PASS | simulation 37B |
| S6 | Generator output left uncommitted | UNIT | `GENERATED_BY_FRAMEWORK`, status not `CLEAN` | PASS | simulation 37C |
| S7 | Session record for a finished session | UNIT | `ORPHANED_SESSION_STUB`, blocks | PASS | simulation 37D |
| S8 | Session record for an **ACTIVE** session | UNIT | `ACTIVE_SESSION_RECORD`, `DIRTY_OTHER_SESSION_OWNED`, does not block | PASS | simulation 37E |
| S9 | That record is not deleted or reverted | UNIT | file still present | PASS | simulation 37E |
| S10 | Dirty sibling worktree | UNIT | listed in `otherDirtyWorktrees` | PASS | simulation 37E |
| S11 | Sibling's uncommitted content survives the run | UNIT | content intact | PASS | simulation 37E |
| S12 | Line-ending-only change | UNIT | normalised or reported, never invisible | PASS | simulation 37F |
| S13 | Dirty tree, run the check, compare branch / HEAD / porcelain | UNIT | byte-identical before and after | PASS | simulation 37G |
| S14 | The dirty file still holds its edit — nothing pulled over it | UNIT | content intact | PASS | simulation 37G |
| S15 | Unfinished Git operations aggregated per worktree | UNIT | `unfinishedByWorktree` is an array | PASS | simulation 37 |
| S16 | Every worktree carries a role, exactly one `PRIMARY` | UNIT | roles present, one primary | PASS | simulation 37 |
| S17 | `session.mjs start` for a branch this checkout lacks | UNIT | `PRIMARY_WORKTREE_ARTIFACT: true` | PASS | simulation 39 |
| S18 | `session.mjs start` on the checked-out branch | UNIT | `PRIMARY_WORKTREE_ARTIFACT: false` | PASS | simulation 39b |
| S19 | Contract, role and instruction documents carry the new fields | UNIT | all present | PASS | simulation 38a–38m |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `node scripts/validate-framework.mjs` | framework structural + behavioural | 2737 | 1 | 0 | ~90s |
| `node scripts/rebuild-backlog.mjs --check` | backlog records and indexes | 126 records, 0 structural errors | 0 | 0 | <5s |
| `node scripts/rebuild-sessions.mjs --check` | session records and indexes | 16 records | 0 | 0 | <5s |
| `node scripts/rebuild-qa.mjs --check` | QA records, coverage matrix | 18 plans, 95 scenarios | 0 | 0 | <5s |
| `node scripts/rebuild-tasks.mjs --check` | parent-task records | 7 tasks | 0 | 0 | <5s |

The one remaining `validate-framework` failure is the engineering-history record
for this task carrying unresolved TODOs, which by design cannot be resolved
until the merge SHA and CI verdict exist. It is resolved before completion.

Not run, and why: `npm run lint`, `check-types`, `test` and `build` — this change
touches no TypeScript, no workspace package and no build input. The three files
changed under `scripts/` are plain Node ESM with no compile step, and `AGENTS.md`
plus `.agent/**` are instruction documents. Running the API or web suites would
have produced a green result that says nothing about this change.

### Regression-test proof

The mutation harness *is* the without-the-fix column: each mutation reintroduces
a specific form of the defect and the simulations must fail.

| Mutation | With fix | Without fix (mutated) |
|---|---|---|
| M1 — `DIRTY_UNEXPLAINED` blocker deleted | PASS | FAIL — 37A blocker check |
| M2 — `primaryWorktreeStatus()` pinned to `CLEAN` | PASS | FAIL — 37A ×3, 37B |
| M3 — per-worktree paths collapsed to a boolean | PASS | FAIL — 37A ×4 |
| M4 — `UNKNOWN` ownership reclassed as `USER` | PASS | FAIL — 37A ×4 |
| M5 — ACTIVE session record misread as an orphan | PASS | FAIL — 37E ×2 |
| M6 — sibling worktrees dropped from the report | PASS | FAIL — 37E |
| M7 — `session.mjs` `strandedInPrimary` pinned to `false` | PASS | FAIL — 39 |

7 of 7 killed.

M7 **survived the first run**. The check covering it (38l) read
`scripts/session.mjs` for the identifiers `PRIMARY_WORKTREE_ARTIFACT` and
`strandedInPrimary`, both of which the mutation left in place while removing
their effect. That is the same defect class as [[BUG-0076]] itself — a value
computed and then not used — and it is why simulation 39 was added to drive
`session.mjs` against a sandbox repository instead of grepping it. Recorded so
the next person writing a framework check does not repeat it.

## Manual Validation

Performed by hand against the real repository, because the six-file dirty state
being repaired existed only there:

- Ran the extended `repo-health.mjs` against the live repository from the task
  worktree. It reported `PRIMARY_WORKTREE_STATUS = DIRTY_OTHER_SESSION_OWNED`
  with `UNEXPLAINED_DIRTY_FILES = 0`, naming
  `docs/sessions/SESSION-0015-…md` as `ACTIVE_SESSION_RECORD` owned by
  SESSION-0015 — a session live in another chat. That is the correct answer, and
  the pre-fix code reported nothing at all for the same state.
- Confirmed the first implementation attributed the primary checkout to
  SESSION-0013 (finished) and SESSION-0015's record to `ORPHANED_SESSION_STUB`.
  Both were real bugs in this change, found by inspection rather than by test,
  and both were fixed: worktree→session attribution now prefers ACTIVE sessions
  and the newest id, and a session record's `STATUS` is read from the file as it
  exists in the primary checkout rather than from this checkout's committed
  indexes. Had the second not been fixed, the framework would have invited
  deleting another chat's live session record.
- Verified `git -C <sibling> status` for all eight worktrees before and after
  several runs; none changed. One sibling (`dijipeople-bugs`, SESSION-0015)
  committed its own work mid-run, which the report correctly picked up as that
  worktree becoming clean.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| REG-065 | New — introduced by this run | PASS |

Re-checked for the `scripts` module: no existing entry in
`docs/qa/regressions/index.md` covers repository health or worktree state, which
is consistent with this being the first time the primary checkout was inspected
at all.

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| BUG-0076 | HIGH | Repository health never inspected the primary worktree | `computed-then-discarded` | REG-065 |

Two further findings were classified rather than fixed here, because neither is
a defect in this change:

| ID | Disposition | Description |
|---|---|---|
| ITEM-0057 | `PRODUCT_DECISION` | Landing env-example domain cutover, preserved at `2472df3`, not committed |
| ITEM-0058 | `DEFER` | `next-env.d.ts` dev/build churn across four apps |

## Known Limitations

- The simulations run against sandbox repositories on **Windows with
  `core.autocrlf=true`**. Behaviour under `autocrlf=false` or on a
  case-sensitive filesystem is not exercised. Path comparison is lowercased,
  which is right for Windows and harmless but imprecise on Linux.
- `--primary-baseline` is only as good as the baseline the caller recorded. The
  framework can prove a path was in the baseline; it cannot prove the baseline
  was taken honestly.
- Ownership attribution reads session records. A dirty path belonging to a
  session that never wrote a record is `UNKNOWN` — correctly, but that means
  `UNKNOWN` will also catch legitimate work from tooling outside the framework.
- No CI verdict at the time of writing; recorded before push.
- The primary checkout still legitimately holds SESSION-0015's record, so
  `PRIMARY_WORKTREE_STATUS = CLEAN` was verified in sandboxes but not against
  the live repository, where the correct answer is
  `DIRTY_OTHER_SESSION_OWNED`.

## Final QA Verdict

**PASS**

Nineteen scenarios pass, all seven mutations are killed, and the two defects
found in the change itself during manual validation were fixed and are now
covered by simulations 37E and the attribution logic. The change is
report-only — proven by capturing branch, HEAD and porcelain either side of a
run on a dirty tree — so the worst realistic failure mode, destroying another
session's or the user's uncommitted work, is tested rather than asserted.

The one open `validate-framework` failure is the engineering-history record's
own TODOs, which cannot be resolved before the merge exists.

## Follow-up

- ITEM-0057 needs a product decision on the `dijipeople.com` apex before any
  env example changes. Owner: architect.
- ITEM-0058 proposes untracking `next-env.d.ts` across all four apps. Deferred.
- The `--primary-baseline` value is currently recorded by hand at
  `PRE_TASK_REPO_HEALTH`. A future task could have `repo-health.mjs --json`
  write it to the session record so the post-task comparison cannot be
  fabricated.
