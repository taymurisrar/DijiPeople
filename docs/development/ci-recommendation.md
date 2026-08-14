# CI Recommendation

**Status: recommendation only. No CI has been implemented.**

There is no `.github/` directory in this repository. That was verified, not
assumed. Nothing runs lint, typecheck or tests automatically on push or pull
request — every validation this framework describes runs only because a human or
an agent chooses to run it.

CI was deliberately **not** built as part of the framework task. Introducing it
changes the development process for everyone, needs a decision about where it
runs and who pays for it, and would have meant committing workflow files that
nobody had agreed to. That is its own decision, with its own ExecPlan.

---

## Why it matters here more than usual

Three properties of this repository make the absence expensive:

1. **Uneven test coverage.** Defect classes that actually ship here — a missing
   tenant filter, a half-declared permission, a fail-open scope — were invisible
   to the existing suites at the time.
2. **A permanently dirty primary checkout.** 50+ modified and 70+ untracked
   files is normal. "It worked on my machine" is unusually unreliable.
3. **Agent-authored changes.** Agents report their own validation results.
   Honest reporting is an instruction, not an enforcement.

---

## Recommended first gate

Deliberately minimal. Every command below is real and already in the repository
— none are invented.

| Step | Command | Why first |
|---|---|---|
| Install | `npm ci` | Deterministic |
| Prisma client | `npm run prisma:generate` | Everything typechecks against it; needs `DATABASE_URL` set, even though it does not connect |
| Typecheck | `npm run typecheck` | Cheapest broad signal |
| Lint | `npm run lint` | ⚠️ see caveat below |
| API unit tests | `npm --workspace api run test` | The largest suite |
| Wiring invariants | included in the API suite | Permissions, seeds, settings wiring |
| Runtime schema | `npm run test:runtime-schema` | Guards sensitive/exported field drift |
| Prisma validate | `npm run prisma:validate` | Cheap schema sanity |
| Web / admin tests | `npm --workspace web run test`, `npm --workspace admin run test` | Fast, pure-logic |

### Caveats that must be handled before enabling

- **`npm --workspace api run lint` runs `eslint --fix`.** In CI that is a
  read-only environment so it is harmless, but do not copy that command into any
  local automation — it rewrites files. Prefer a `--no-fix` variant for CI.
- **`prisma generate` needs `DATABASE_URL`.** A placeholder is enough; it does
  not connect. Do not put a real connection string in CI just for codegen.
- **e2e suites need a live database.** Leave `test:e2e` out of the first gate, or
  add a service container as a second, separate job.
- **`npm run build` is `--concurrency=1`** and slow. Not in the first gate; run
  it on merge to `main` or nightly.

---

## What should NOT gate initially

- **The dual-permission wiring invariant.** It currently fails by design — there
  is a large, known inventory of handlers declaring one permission family. Gating
  on it would block every PR on unrelated pre-existing debt. Track the count
  instead, and gate only once it reaches zero.
- **Coverage thresholds.** Coverage is uneven; a threshold would push people to
  write shallow tests.
- **The full build**, per the timing caveat above.

---

## A QA gate for high-risk changes

Once the basic gate is stable, consider requiring a QA run file for changes
touching authorization, payroll, attendance, migrations or integrations — the
same trigger table as `docs/qa/README.md`.

Mechanically this is a check that a PR touching those paths also adds a file
under `docs/qa/runs/`. It cannot verify the run was *good*, only that it exists.
That is still worth something, but it must not be mistaken for review.

---

## Recommended sequencing

1. Typecheck + API unit tests only. Establish that green means something.
2. Add lint (`--no-fix`), web/admin tests, prisma validate, runtime schema.
3. Add the QA-run-exists check for high-risk paths.
4. Add e2e as a separate job with a database service.
5. Revisit the wiring invariant once its inventory is close to zero.

Do not implement any of this without an ExecPlan and an explicit decision — it
changes everyone's workflow, not just the agents'.
