# Git and CI cost — what the branch model changes

> **Last verified:** 2026-08-16 against `.github/workflows/ci.yml`, the observed
> protection settings on `main`, and the run history of this repository.

Adopting `develop` as the autonomous integration branch was not primarily a
speed change — it exists so that ordinary work stops mutating the production
branch. But it removes real, measurable overhead, and it is worth being precise
about which, because the tempting savings are the ones that must not be taken.

---

## Where the time actually went

### 1. Two full CI runs per task

`.github/workflows/ci.yml` triggers on `push: ['**']` **and** on
`pull_request: [main, develop]`. The `concurrency` group is `ci-${{ github.ref }}`,
and a push ref and a pull-request ref are different refs, so both runs execute.

```
before   push agent/<task>   → run 1  (current workflow)
         open PR → main      → run 2  (same workflow, on the merge commit)
after    push agent/<task>   → run 1  (current workflow)
         integrate to develop directly — no PR, no second run
```

**Halves the gate runs for an ordinary task.** Nothing is skipped: run 1 is the
same workflow on the same code, and it is the run whose verdict authorises the
integration.

A PR to `develop` is still available and still free of approval requirements —
use it for security, database, architecture and large cross-module work, where
the review trail is worth the second run.

### 2. Strict up-to-date on `main` restarts the gate whenever anybody merges

`main` carries `required_status_checks.strict: true`. When `main` advances while
a PR is in review, that PR must merge `main` and re-run the entire gate before it
can land.

This is not hypothetical here:

- PR #5 was refused within an hour of protection being applied, because #6
  merged during its review.
- **During this task alone**, `origin/main` advanced twice —
  `714632d → c179ea3 → b90f33e` — from a concurrently running session. A
  main-targeted PR would have re-run the full ten-job gate twice more, for
  reasons having nothing to do with the change under review.

`develop` has no required status check, so integration does not restart on
somebody else's merge. Conflicts still have to be reconciled and revalidated —
that is the Integrator's job and it has not been relaxed — but the *gate* does
not re-run because an unrelated branch landed.

**This is the largest single saving, and it grows with the number of concurrent
sessions.** With three sessions active, a main-targeted PR is racing two other
merges throughout its review.

### 3. Production promotion stops being per-task

Before, every documentation fix, framework change and small bug fix was a
mutation of the production branch. After, promotion happens once per release and
batches everything that accumulated on `develop`.

The saving is not CI minutes. It is that a release becomes a deliberate act with
its own readiness evaluation, instead of a side effect of merging a typo fix.

---

## What was deliberately not changed

Each of these looks like an easy saving and is not available:

| Tempting | Why it stays |
|---|---|
| Skip CI on docs-only branches | "Docs-only" is a judgement made before the diff is final, and this repository's docs include generated indexes whose drift is a real failure. `--check` is seconds. |
| Reuse a CI verdict from an earlier commit on the branch | A verdict on a different tree is a verdict about different code. The shared-target gate requires `PASS` **on the exact SHA**. |
| Drop the `database-migration` job for changes that "obviously" miss the schema | It applies the whole committed history to an empty PostgreSQL, which is exactly what a new deployment does. Cheap insurance against an unrunnable history. |
| Trim regression tests that have not failed in months | A regression that stops being run is a defect waiting to return. |
| Relax `main` protection | Never in scope. The model reduces how often `main` is touched; it does not make touching it easier. |

---

## Where the remaining time is

Measured from the job list, not estimated:

- **Ten jobs each run `npm ci`.** That dominates wall-clock. `actions/setup-node`
  with `cache: npm` is already configured, so it is a restore rather than a cold
  install, but it still runs ten times.
- **`build` runs `turbo run build --concurrency=1`.** Serialised deliberately;
  Turbo's remote cache is not configured, so nothing is shared between runs.
- **`validate` needs no dependencies at all** and is the fastest useful signal —
  which is why the five `--check` steps for the generated indexes were added
  there rather than to a job that installs.

Two changes would help and neither belongs to this task:

- A remote Turbo cache, so `build` and `typecheck` reuse work across runs.
- A single install job publishing `node_modules` as an artifact the test jobs
  consume, replacing ten restores with one install and ten downloads.

Both are infrastructure work with their own trade-offs, and both are worth
measuring before adopting. Neither is a correctness gate, so neither is urgent.

---

## Expected effect, stated honestly

For an ordinary task, with one session active:

```
gate runs        2 → 1
re-runs caused by an unrelated merge landing on main    common → none
production branch mutations   1 per task → 1 per release
```

With several sessions active the second line dominates, and the saving is larger
than the first line suggests.

**No gate was removed and no evidence requirement was weakened.** What was
removed is a second execution of the same checks on the same code, and a
restart-on-unrelated-merge that protected a branch ordinary work no longer
targets.
