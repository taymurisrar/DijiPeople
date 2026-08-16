# Engineering History — Monorepo app documentation

| | |
|---|---|
| **Task Title** | Deep documentation of `apps/docs`, `apps/landing` and `apps/agent-desktop` |
| **Task Type** | KNOWLEDGE (LARGE) — TASK-0002 |
| **Date** | 2026-08-16 |
| **Architect Plan** | `docs/tasks/TASK-0002-deep-documentation-of-apps-docs-apps-landing-and-apps-agent-.md` — a parent task record with nine work packages, not a separate ExecPlan. `PLANS.md` requires an ExecPlan for the change classes it lists; this task changed no product code, no schema and no contract |
| **Agents Used** | Architect (lead, routing + triage), Frontend (`apps/landing` audit), Integration (`apps/agent-desktop` audit), QA (verification against code), Reviewer (claim checking), Integrator (branch/PR/CI/merge), Release/DevOps (repo health), Knowledge Capture, Obsidian Sync. **Deliberately not used:** Database (no schema in scope), UI/UX (no experience change), Backend/API (used read-only for contract verification, never to change code) |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/knowledge-monorepo-app-documentation` |
| **Base SHA** | `78072d2fadfa984f6bcbd972bf37f8f0fd7acdee` |
| **Final Task SHA** | `a35bc4f4d6f1612ce27d6fbebc3a76b395d2e958` |
| **Target Branch** | `main` |
| **Pull Request** | [#19](https://github.com/taymurisrar/DijiPeople/pull/19) |
| **Merge Commit** | `TODO_MERGE_SHA` |
| **Final Target SHA** | `TODO_FINAL_TARGET_SHA` |

### Commits

```
a35bc4f docs(knowledge): document apps/docs, apps/landing and apps/agent-desktop
```

One commit. The work is a single coherent documentation change and splitting it
would have produced commits that individually left the context layer
inconsistent — the corrections and the notes that reference them belong
together.

### Worktrees

No task worktree was created. `docs/development/git-worktrees.md` reserves
worktrees for genuinely concurrent work and warns against spinning one up for a
change that could be a branch in the main checkout; this was markdown-only and
the primary checkout was verified clean (`DIRTY_PATHS 0`) before branching. The
branch was cut and worked in place.

Pre-existing worktrees, untouched:

```
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0  [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-hotfix        [agent/hotfix-*]
```

### Files Changed

50 files against `origin/main` — 21 new, 29 modified. No file outside `docs/`,
`.agent/context/`, `AGENTS.md`, `apps/landing/AGENTS.md`,
`packages/config/AGENTS.md` and `apps/docs/README.md` was touched. **No product
source file was modified.**

## Conflicts

None. The branch was cut from the current `origin/main` SHA and merged before
anything else landed on the target.

## Conflict Resolutions

Not applicable — there were no conflicts.

## QA

| | |
|---|---|
| **QA Report** | `docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md` — **PASS**, seven material findings, all triaged |
| **Bug IDs** | Created: BUG-0031, BUG-0032, BUG-0033, BUG-0034, BUG-0035, BUG-0036, BUG-0037. Updated: BUG-0021 (scope widened, still OPEN) |
| **Backlog Items** | Created: ITEM-0026, ITEM-0027, ITEM-0028. Updated: ITEM-0011 (second occurrence recorded) |

Six of the seven new records are `HIGH`; none was fixed, because `KNOWLEDGE`
routing forbids product change and the Architect triaged four of them
`PLAN_REQUIRED` rather than pretending they were one-line fixes. BUG-0037 is the
exception — verified documentation drift, which `KNOWLEDGE` explicitly permits
correcting, and it was fixed in this change.

**A subagent claim was rejected during review.** The knowledge-audit agent
reported that `apps/agent-desktop/release/` and its `.env` were committed to the
repository, including a ~95 MB installer. `git ls-files apps/agent-desktop`
returns 49 files, none of them under `release/` and none of them `.env`, and
`git check-ignore -v` confirms `.gitignore:18` matches. The claim was dropped
rather than propagated into a bug record. Recorded here because it is the kind
of finding that reads as alarming and would have been expensive to act on.

## CI

| | |
|---|---|
| **CI Run ID** | `31957159439` |
| **CI Result** | `TODO_CI_RESULT` |

The verdict was read on `a35bc4f`, the exact SHA merged.

## Post-Merge Validation

`TODO_POST_MERGE`

## Release / Deployment Impact

**None — not deployed.** No product code, no schema, no migration, no
environment variable and no contract changed, so nothing reaches any
environment. `DEPLOYMENT_STATUS = NOT_REQUIRED`.

`DEPLOYMENT_DRIFT_STATUS = UNKNOWN` — this repository cannot read a deployed SHA
([[ITEM-0010]]), which remains the honest answer rather than an inference from
the merge.

## Knowledge Capture

Implementation record: `docs/knowledge/implementations/2026-08-16-monorepo-app-documentation.md`.

New (`ARCHITECTURE_CHANGE` / `DOMAIN_RULE`): `product/landing-website.md`,
`product/desktop-agent.md`, `architecture/landing-architecture.md`,
`architecture/desktop-agent-architecture.md`,
`architecture/docs-application.md`, `architecture/monorepo-application-map.md`,
`architecture/desktop-api-gateway-relationship.md`.

Updated in place: `docs/knowledge/README.md`, `modules/README.md`,
`product/product-areas.md`, `product/dijipeople-platform-overview.md`,
`architecture/system-architecture.md`,
`architecture/integration-architecture.md`, `modules/leads.md`,
`modules/attendance.md`.

Context corrected (`ARCHITECTURE_CHANGE`), all with refreshed verification
metadata: `.agent/context/integration-patterns.md`, `system-overview.md`,
`repo-map.md`, `testing-architecture.md`, `frontend-architecture.md`,
`deployment-runtime.md`.

Instruction files corrected (`DOCUMENTATION_RULE`): root `AGENTS.md`,
`apps/landing/AGENTS.md`, `packages/config/AGENTS.md`, `apps/docs/README.md`,
`docs/architecture/frontend.md`, `docs/development/ci.md`,
`docs/development/git-worktrees.md`.

`FEEDBACK_PROMOTION_STATUS = NOT_REQUIRED` — the user issued the task and made
no correction during it.

## Obsidian Sync

`TODO_OBSIDIAN`

## Cleanup

`TODO_CLEANUP`
</content>
