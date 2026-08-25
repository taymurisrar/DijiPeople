# Engineering History — Two checks that were argued correct rather than tested

| | |
|---|---|
| **Task Title** | repo-health blames this task for another session's merge (and a second defect found while fixing it) |
| **Task Type** | BUGFIX |
| **Date** | 2026-08-25 |
| **Architect Plan** | None. Two SMALL bugs, one script each, no schema and no runtime surface — below the `PLANS.md` threshold. The records are [[BUG-1203]] and [[BUG-1208]] |
| **Agents Used** | Architect (triage, both `FIX_NOW`), QA (reproduction, regressions, scenarios), Reviewer (the both-directions argument on REG-249), Integrator (merge). **Deliberately not used:** Frontend, Backend/API, Database, Security — nothing outside `scripts/` and its records was touched |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/repo-health-task-sha` |
| **Base SHA** | `ddb457ff8907c0a7488e8b5154cbcf8625dd644b` |
| **Final Task SHA** | `5f2648d65a2c313247630e17b7320d1078d3535e` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — fast-forward. `develop` was still at the base SHA when the verdict returned, so integration was `git push origin 5f2648d6:refs/heads/develop` |
| **Final Target SHA** | `5f2648d65a2c313247630e17b7320d1078d3535e` — identical to the CI-verified SHA |

> The generator filled Base and Target as `origin/main`, its default. Corrected:
> this was an ordinary BUGFIX targeting `develop`, and `main` was never touched.
> `MAIN_CHANGE_STATUS = UNTOUCHED` — which this task can now assert from any
> checkout, that being the point of it.

### Commits

```
5f2648d6 fix(framework): two checks that were argued correct rather than tested
```

### Files Changed

**25 file(s) against the task's own base**, `ddb457ff`.

> The generated list showed 52 against `origin/main`; the extra 27 belong to
> tasks already on `develop`. Same correction as the previous record, and for
> the same reason: a diff taken from the wrong base claims work the task did
> not do.

```
A  scripts/lib/task-sha-ref.mjs          the BUG-1203 decision, extracted
A  scripts/task-sha-ref.test.mjs         7 cases
A  scripts/lib/index-drift.mjs           the BUG-1208 comparison, extracted
A  scripts/index-drift.test.mjs          7 cases
A  docs/bugs/BUG-1203-...                repo-health misattribution
A  docs/bugs/BUG-1208-...                platform-dependent drift check
A  docs/qa/scenarios/QA-INFRA-002-...    both directions of MAIN_CHANGE_STATUS
A  docs/qa/scenarios/QA-INFRA-003-...    the CRLF case CI cannot run
A  docs/sessions/SESSION-0052-...        the session
M  scripts/repo-health.mjs               calls taskShaRef()
M  scripts/generate-component-index.mjs  calls indexIsCurrent()
M  docs/qa/regressions/index.md          REG-249, REG-250
M  .github/workflows/ci.yml              two checks added to Framework validation
M  package.json                          test:task-sha-ref, test:index-drift
   ... plus 11 regenerated index, matrix and dashboard files
```

## Conflicts

None. `origin/develop` was still at `ddb457ff` — the SHA this branch was cut
from — when the verdict returned, so the integration was a fast-forward.

Checked rather than assumed, twice: `git rev-list --count HEAD..origin/develop`
returned 0 immediately before the push, and again immediately before the merge.

## Conflict Resolutions

Not applicable — no conflicts.

## QA

| | |
|---|---|
| **QA Report** | [[QA-INFRA-002]] and [[QA-INFRA-003]], both executed 2026-08-25, both PASS |
| **Bug IDs** | [[BUG-1203]] and [[BUG-1208]], created and closed `FIXED` in this task |
| **Backlog Items** | None |

Both bugs came out of TASK-0022's own verification rather than a QA sweep, which
is worth recording: the health check meant to confirm that task was clean is
what proved it was being lied to.

## CI

| | |
|---|---|
| **CI Run ID** | `32846987432` |
| **CI Result** | PASS — `REMOTE_CI_STATUS = PASS for 5f2648d` |

Read on the exact SHA that was merged.

## Post-Merge Validation

Run against the merged SHA, byte-identical to `origin/develop` at `5f2648d6`:

| Command | Result |
|---|---|
| `node scripts/validate-framework.mjs` | PASS — 3753 checks |
| `node --test scripts/task-sha-ref.test.mjs` | PASS — 7/7 |
| `node --test scripts/index-drift.test.mjs` | PASS — 7/7 |
| `node --test scripts/knowledge-terms.test.mjs` | PASS — 8/8 |
| `node scripts/generate-component-index.mjs --check` | PASS — current on a CRLF checkout, which is the BUG-1208 case |
| `node scripts/check-work-packages.mjs` | 2 failures, both pre-existing on TASK-0011 and TASK-0018; neither file is in this task's diff |

The end-to-end proof for BUG-1203 is the one worth keeping, because it is the
only evidence that distinguishes a fix from a suppression. Same checkout, same
baseline, before and after:

```
before  MAIN_CHANGE_STATUS  CHANGED_BY_THIS_TASK (baseline 7d91c8a)
after   MAIN_CHANGE_STATUS  UNTOUCHED (baseline 7d91c8a, advanced 28 commit(s) by other sessions)
```

...while `--task-sha 08d79012`, a commit genuinely on `origin/main`, still
produces `CHANGED_BY_THIS_TASK` **and** its blocker.

### On the mutation evidence

Both regressions were mutation-verified, and one of those verifications was
initially wrong in a way worth recording. The first mutation of
`index-drift.mjs` was a `sed` whose escaping silently failed to match. The suite
stayed green — which reads exactly like "this test does not catch the
regression", and would have been written down as a coverage gap that did not
exist. Re-run with the mutation confirmed applied, it failed 2 cases.

**A mutation test is evidence only once you have confirmed the mutation
landed.** Print the mutated line before believing the run.

## Release / Deployment Impact

None — not deployed. Nothing here reaches a runtime: no API, no app bundle, no
schema, no environment variable. `scripts/` is developer and CI tooling.

`DEPLOYMENT_STATUS = NOT_REQUIRED`. `MAIN_CHANGE_STATUS = UNTOUCHED`.

## Knowledge Capture

- [`docs/knowledge/framework/checks-argued-not-tested-2026-08-25.md`](../../knowledge/framework/checks-argued-not-tested-2026-08-25.md)
  — category `framework`.

It records what the two bugs share rather than either bug. Both were validation
checks carrying a long, correct comment and no test, and in both cases a later
edit walked into the failure the comment described. In `repo-health.mjs` the
comment did not merely sit near the bug, it *predicted* it — somebody had hit
that exact false positive, understood it, fixed it and written it down, and a
fallback added underneath reintroduced it.

**A comment is not a constraint.** It records what an author knew; it cannot
stop the next author from not knowing it.

Two secondary lessons sit in the same note: pin the direction you are *not*
fixing, because a false positive's obvious fix can hide a true one; and a check
whose result depends on the platform is two checks of which only one is being
run.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran; this task's own notes published and
verified clean.

`OBSIDIAN_SYNC_STATUS = COMPLETE_WITH_DOCUMENTATION_WARNING`, carried forward
unchanged from the previous record. The same three pre-existing findings remain
— a dead wikilink in a prior release record pointing at an agent-memory slug, a
graph-orphaned ITEM-0091, and a stale generated `blocked.md`. None belong to
this task, and two belong to a branch still in flight. Deliberately untouched.

## Cleanup

- Task worktree `D:/My Work/hrm-dijipeople/DijiPeople-repohealth` removed.
- Local branch `agent/repo-health-task-sha` deleted;
  `origin/agent/repo-health-task-sha` retained, since it carries the SHA the CI
  verdict names.
- SESSION-0052 closed, `STATUS: COMPLETE` written to the record by hand —
  `session.mjs finish` does not write it, and a stale ACTIVE record fails the
  next session that takes the same branch.
- Primary checkout left exactly as found: `apps/landing/next-env.d.ts` and
  `services/api/prisma/seed-legal.ts` were dirty before this work began and are
  neither staged, reverted nor committed. They are the user's.
