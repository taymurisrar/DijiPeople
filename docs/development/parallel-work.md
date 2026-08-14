# Parallel Work Rules

How multiple agents (or engineers) split DijiPeople work without corrupting each
other's changes.

> **Core rule: parallelize independent work, serialize dependent work.**
>
> Agents must not parallelize tasks merely because multiple agents are
> available.

Task classification (`PARALLEL_SAFE` / `DEPENDENCY_BLOCKED` / `INTEGRATION`) is
defined in [`../../PLANS.md`](../../PLANS.md). This document is the practical
guidance behind it.

---

## The four-part test

Two tasks may run in parallel only if **all four** hold:

1. **No shared files.** Not "unlikely to conflict" — none.
2. **No output dependency.** Neither needs the other's result, including a
   regenerated Prisma client or a merged API contract.
3. **Independently validatable.** Each can be typechecked and tested on its own.
4. **No single-writer file involved.** See below.

Fail any one → sequential, even if that is slower.

---

## Single-writer files

These are touched by **one task at a time, ever**. They are large, central, and
generate conflicts that are painful or unsafe to resolve mechanically.

| File / path | Why |
|---|---|
| `services/api/prisma/schema.prisma` | ~11,800 lines, 285 models. Concurrent edits conflict constantly and a bad merge silently changes the database. |
| `services/api/prisma/migrations/**` | Migration order is history. Two agents generating migrations produces an unapplicable sequence. |
| `services/api/src/common/constants/permissions.ts` | 2,482 lines; the permission source of truth. |
| `services/api/src/common/constants/rbac-matrix.ts` | 1,347 lines; the RBAC source of truth. |
| `services/api/src/app.module.ts` | Every new module registers here. |
| `services/api/src/common/guards/**` | Auth and permission enforcement. |
| `packages/config/platform-runtime-schema.generated.json` | Generated; regenerate, never merge. |
| `apps/web/lib/security-keys.ts` | Hand-maintained mirror of the API's permission keys. |

If two tasks both need one of these, the second is `DEPENDENCY_BLOCKED` on the
first.

---

## What is normally parallel-safe

- **Different API modules** that do not import each other — e.g. `leave` and
  `claims`, or `partners` and `recruitment`.
- **Different frontend module adapters** under
  `apps/web/lib/runtime/modules/` — separate files, separate specs.
- **Frontend UX preparation** against an agreed contract while the backend is
  being built. The contract must be written down in the ExecPlan first;
  otherwise this is not parallel work, it is two guesses.
- **Documentation and ADRs** — `docs/`, Obsidian notes.
- **Test-plan authoring** — enumerating cases before the code exists.
- **Security analysis** — reading and reporting, no edits.
- **Integration investigation and spikes** — reading vendor docs, probing a
  device, reading Stripe behaviour.
- **.NET gateway work** alongside Node work, provided the runtime contract is
  fixed.
- **Landing-page work** alongside product work.

---

## What must stay sequential

- **Schema design → everything that depends on the generated Prisma client.**
  Backend code referencing new models does not compile until
  `npm run prisma:generate` has run against the merged schema.
- **Migration → backfill → contract phase.** By definition ordered.
- **API contract → frontend integration.** UX preparation can start early;
  wiring to a real endpoint cannot.
- **Permission key addition → endpoint decoration → seed grant → UI mirror.**
  All four steps, in order, one owner.
- **Anything that changes a response shape → the three consumers of it**
  (`apps/web`, `apps/admin`, the desktop agent / gateway).
- **`app.module.ts` registration** for two new modules — serialize the
  registration even if the modules themselves were built in parallel; it is an
  `INTEGRATION` task.
- **Platform runtime schema regeneration** after Prisma changes.

---

## Worked example — "Overtime approval" feature

Assume: a new `OvertimeRequest` model, an approval flow, an API module, a
tenant-product screen, and a new permission set.

**Wave 1 — sequential (single writer)**
- `DEPENDENCY_BLOCKED` → nothing precedes it, but nobody else may touch schema:
  add `OvertimeRequest` + indexes + migration, regenerate the client.
  *Branch:* `agent/overtime-db`

**Wave 1 — genuinely parallel alongside it**
- `PARALLEL_SAFE` — write the ExecPlan's test strategy and enumerate edge cases
  (partial day, DST boundary, retroactive request, cancelled shift).
- `PARALLEL_SAFE` — draft the tenant-product screen against the agreed API
  contract, using `StandardModuleListPage` / `StandardModuleRecordPage`, with
  mocked data. *Branch:* `agent/overtime-ui`
- `PARALLEL_SAFE` — document the approval rules in Obsidian and draft the ADR
  for how overtime interacts with existing approval matrices.

**Wave 2 — after the schema lands**
- `DEPENDENCY_BLOCKED` on `agent/overtime-db` — build the API module: service,
  repository, DTOs, transactions, audit. *Branch:* `agent/overtime-api`
- `DEPENDENCY_BLOCKED` on `agent/overtime-db` — add permission keys and RBAC
  matrix entries, grant in `seed-config.ts`, assert in `verify-seed-config.ts`.
  **Sequential with the API work if it touches the same constants files** —
  in practice, give both to one owner. *Branch:* `agent/overtime-rbac`

**Wave 3 — integration**
- `INTEGRATION` — register the module in `app.module.ts`, decorate endpoints
  with both permission decorators, wire the UI to the real endpoints, add
  navigation, mirror the needed keys into `apps/web/lib/security-keys.ts`.
- `INTEGRATION` — full validation: `npm run typecheck`, `npm run lint`,
  `npm --workspace api run test`, `npm --workspace api run test:e2e`,
  `npm --workspace web run test`.
- Reviewer pass.

Note what is **not** parallel here: the schema, the permission constants, and
the final wiring. Three of the eight tasks, and they are the three that would
have caused the damage.

---

## Required plan output

Every ExecPlan must end with these three lists, explicitly:

```markdown
Parallel-safe tasks:
- [PARALLEL_SAFE] <task> — branch agent/<feature>-<scope>
- ...

Dependency-blocked tasks:
- [DEPENDENCY_BLOCKED] <task> — blocked by <task/branch>, unblocked when <condition>
- ...

Integration tasks:
- [INTEGRATION] <task> — runs after <tasks>, single owner
- ...
```

A plan without these three lists is not finished.

---

## Coordination rules

1. **One branch per task**, named `agent/<feature>-<scope>`. See
   [`git-worktrees.md`](git-worktrees.md).
2. **One agent per branch.** Two agents on one branch is not parallelism, it is
   a race.
3. **Rebase before integrating**, not merge-commit spaghetti.
4. **Integration is a task**, owned by one agent, listed in the plan, run last.
5. **No unrelated changes on any branch.** A branch that also reformats an
   unrelated file cannot be reviewed independently.
6. **If a parallel task discovers it needs a single-writer file, it stops** and
   reports back rather than editing it. The plan gets updated.
