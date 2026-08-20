# Engineering History — Database Agent coherence is verified after the work, not only before

| | |
|---|---|
| **Task Title** | Database Agent coherence is verified after schema work, not only before |
| **Task Type** | FRAMEWORK (BUGFIX in effect — BUG-0083) |
| **Date** | 2026-08-20 |
| **Architect Plan** | NOT_APPLICABLE — no change class in [`PLANS.md`](../../../PLANS.md) applies. The change is confined to the framework's own tooling, its records and its documentation; no application behaviour, no schema, no migration, no permission and no API contract is touched |
| **Agents Used** | Architect (diagnosis, triage, and this record), Database (the coherence invariant and its repair), Release/DevOps (repository health, the primary-checkout question), QA (the mutation tests and the scenario), Integrator (branch, commit, CI verdict, integration). **Not used:** Backend/API, Frontend, UI/UX, Integration, Security — no application surface, no boundary and no authorization path is in scope |

## What the user asked

> "Check which agent is not doing it's job properly and fix it" — with the
> terminal output of `npm run start:dev` failing on `develop` at `844b6d3`.

The question is unusual in that the *symptom* was already handled: the Prisma
freshness guard caught the stale client and named the fix. So the task was not
to repair the boot, but to find which agent should have prevented the user from
ever seeing it. The answer is the **Database Agent**, and the reasoning is in
BUG-0083.

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/db-coherence-postflight` |
| **Base SHA** | `844b6d3fb208e74c761070ac64c59e53506f34bc` |
| **Final Task SHA** | `77c24c76be383fbb27074f54f49171a2ccfde168` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — integrated by ref-push (`git push origin agent/db-coherence-postflight:develop`), a fast-forward `844b6d3..77c24c7`. No merge commit exists, which is the point: the tip of `develop` is byte-for-byte the SHA CI verified |
| **Final Target SHA** | `77c24c76be383fbb27074f54f49171a2ccfde168` |

### Commits

```
77c24c7 fix(framework,database): the gate that reported PASS over its own failing fields — BUG-0083
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            844b6d3 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75 [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab11 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f0 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               77c24c7 [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8 [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622e [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                844b6d3 [agent/identity-and-membership]
```

### Files Changed

23 file(s) against `origin/develop`.

```
M	.agent/agents/database.md
M	.agent/context/agent-handoffs.md
M	.agent/context/task-completion-contract.md
M	AGENTS.md
M	docs/backlog/completed.md
M	docs/backlog/index.md
A	docs/bugs/BUG-0083-the-database-agent-preflight-reports-pass-on-a-database-with.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/qa/coverage-matrix.md
A	docs/qa/known-bug-patterns/stale-generated-artifact.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-CI-002-the-database-agent-verdict-cannot-report-pass-over-a-failing.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-012-deployment-release.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0020-database-agent-coherence-is-verified-after-schema-work-not-o.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	package.json
M	scripts/db-preflight.mjs
A	scripts/db-preflight.test.mjs
M	scripts/validate-framework.mjs
```

## Conflicts

None. The branch was cut from `origin/develop` at `844b6d3` and integrated by
ref-push while `develop` was still at that SHA, so the tip equals the CI-verified
commit exactly.

Two other sessions were active throughout (SESSION-0003 on
`agent/global-remediation-program`, SESSION-0019 on `agent/ci-e2e-remediation`).
Neither holds a lease on `framework` or `schema`, and neither writes
`scripts/db-preflight.mjs`, so `session.mjs check` classified the work
`SAFE_PARALLEL`. The `schema` and `framework` leases were held for the duration
and released before finalization.

## Conflict Resolutions

None required.

One resolution is worth recording even though Git never saw it as a conflict.
BUG-0060 deliberately decided **not** to regenerate the Prisma client on
`start:dev`, because ~20s on every reload taxes every developer to cover a rare
event. That decision is still right, and this task does not reverse it. The
alternative — auto-regeneration on the watch path — would have made the symptom
disappear while leaving the actual defect (a gate returning `PASS` over its own
failing fields) untouched, and would have cost every developer a slower loop
forever. What changed is *who is asked*: the task that authors the migration,
not the person who later pulls it.

## QA

| | |
|---|---|
| **QA Report** | No `docs/qa/runs/` record — this task's verification is the regression suite itself, [REG-078](../../qa/regressions/index.md) / [QA-CI-002](../../qa/scenarios/QA-CI-002-the-database-agent-verdict-cannot-report-pass-over-a-failing.md), plus the throwaway-database measurement recorded in BUG-0083. Verdict: PASS |
| **Bug IDs** | [BUG-0083](../../bugs/BUG-0083-the-database-agent-preflight-reports-pass-on-a-database-with.md) created and closed (`VERIFIED` / `DONE`). Related, unchanged: BUG-0060, BUG-0068 — their `qa_scenarios` now also carry QA-CI-002 |
| **Backlog Items** | None created, none advanced. No finding from this task is unclassified |

## CI

| | |
|---|---|
| **CI Run ID** | [32338975125](https://github.com/taymurisrar/DijiPeople/actions/runs/32338975125) — head SHA `77c24c7`, the SHA that was integrated |
| **CI Result** | PASS — all 14 jobs `success`, and the `CI required gate` check-run on `77c24c7` reports `completed success` |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run in the **primary checkout** at `77c24c7` after the fast-forward — the same
checkout the user reported the failure from, which is the only place the last
row below means anything.

| Command | Result |
|---|---|
| `node scripts/db-preflight.mjs --postflight` | `DATABASE_COHERENCE_STATUS = PASS`; schema, migrations, client and local database all `CURRENT`; 213 migrations, all applied |
| `npm run --silent db:postflight` | PASS — exercises the new npm wrapper, not only the script |
| `node --test scripts/db-preflight.test.mjs` | 9 tests, 9 pass — REG-078 |
| `node scripts/validate-framework.mjs` | passed, 2885 checks |
| `rebuild-backlog / rebuild-qa / rebuild-sessions / rebuild-tasks --check` | all current; 147 records, 19 plans, 111 scenarios, 20 sessions, 8 tasks |
| `npm run check:prisma-client` | `OK — 295 enums, 312 models, 7300 fields reachable` |
| `npx prisma migrate status` | *Database schema is up to date* |

The last two are the user's original failure, re-run where it happened.

One transient to record so it is not mistaken for a defect later: the first
`npm run db:postflight` died with `[low_level_alloc.cc] RAW: Check new_pages !=
nullptr failed: VirtualAlloc failed`, and a retry exited 66. That is Windows
memory pressure from concurrent heavy processes, not the script — the direct
`node` invocation and a later `npm run --silent` both returned `PASS` and exit
`0` on the same checkout, unchanged.

## Release / Deployment Impact

None — not deployed. `main` was never touched (`MAIN_CHANGE_STATUS = UNTOUCHED`,
baseline `b90f33e`). Nothing here ships: the change is framework tooling, records
and documentation, plus two npm scripts. No environment, no rollback class, no
release record.

The one runtime action taken was against the **user's local development
database** — `prisma migrate deploy` applying three additive migrations that
TASK-0008 had already committed. Forward-only, no reset, no `db push`, no data
loss. All three are `ADD COLUMN` (nullable or defaulted) plus one unique index
on a nullable column, so the operation is reversible in the only sense that
matters here: nothing existing was read, rewritten or dropped.

## Knowledge Capture

| File | Category |
|---|---|
| [`docs/qa/known-bug-patterns/stale-generated-artifact.md`](../../qa/known-bug-patterns/stale-generated-artifact.md) | Bug pattern — new |
| [`docs/bugs/BUG-0083-…`](../../bugs/BUG-0083-the-database-agent-preflight-reports-pass-on-a-database-with.md) | Bug record — new |
| [`docs/qa/scenarios/QA-CI-002-…`](../../qa/scenarios/QA-CI-002-the-database-agent-verdict-cannot-report-pass-over-a-failing.md) | QA scenario — new |
| [`docs/qa/regressions/index.md`](../../qa/regressions/index.md) | REG-078 — new |
| [`.agent/agents/database.md`](../../../.agent/agents/database.md) | Agent instruction — postflight, the `INCOMPLETE` verdict, the third arrival |
| [`.agent/context/task-completion-contract.md`](../../../.agent/context/task-completion-contract.md) | Contract — `DATABASE_COHERENCE_STATUS` |

The durable lesson is the bug pattern, and it is the reason that file exists
rather than a fourth paragraph inside a bug record. Read BUG-0060, BUG-0068 and
BUG-0083 in order and they are one story: the derived artifact went stale in a
new way each time, and each fix moved the guard's blind spot instead of closing
it. Both earlier fixes guarded `start:dev` — the developer's path, which is the
last possible moment and the wrong actor.

A second, smaller lesson is about validation itself. `validate-framework.mjs`
simulation 32b asserts that `database.md` *says* "UNKNOWN is not an acceptable
resting state". That sentence was present and true for the entire period the
script was reporting `PASS` over two `UNKNOWN` fields. A check on prose cannot
see a defect in the code the prose describes — hence 32e–32g, which call
`classifyVerdict()` rather than grepping for a claim about it.

## Obsidian Sync

`node scripts/generate-dashboards.mjs` ran and rewrote the Engineering Dashboard
and Control Center. `node scripts/sync-obsidian.mjs` was **not** run — it needs a
local vault configuration this session does not have. `knowledge:retrieve`
reports `OBSIDIAN_CONTEXT = AVAILABLE` at
`D:/My Work/hrm-dijipeople/DijiPeople-Vault`, so the sync is available to a
session that holds that configuration; every source file above is Git-tracked and
will publish unchanged when it next runs.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-db-coherence` and branch
`agent/db-coherence-postflight` removed after integration. The throwaway
`dbcoherence_probe` database was dropped immediately after the measurement; the
populated `dijipeople` development database was never reset or recreated.

The primary checkout ends as it began: one modified file,
`apps/landing/next-env.d.ts`, which was already dirty at task start and belongs
to the user. It was recorded as `--primary-baseline` and never touched, which is
what lets `PRIMARY_WORKTREE_STATUS` report `DIRTY_USER_OWNED` rather than
`DIRTY_UNEXPLAINED`.
