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
| **Final Task SHA** | `88e02594b1162d91b33955c7c4d73dff76ca3cf3` |
| **Target Branch** | `main` |
| **Pull Request** | [#19](https://github.com/taymurisrar/DijiPeople/pull/19) — MERGED |
| **Merge Commit** | `aed886eb37436d7b2ebf64ca8d47293740853275` |
| **Final Target SHA** | `aed886eb37436d7b2ebf64ca8d47293740853275` |

### Commits

```
88e0259 merge origin/main and renumber colliding record ids
d7c07b7 docs(knowledge): confirm the frontend deployment target is Vercel
a35bc4f docs(knowledge): document apps/docs, apps/landing and apps/agent-desktop
```

`a35bc4f` is the body of the work — a single coherent documentation change,
because the context corrections and the notes referencing them would each be
wrong without the other.

`d7c07b7` records a fact the source audit could not establish and CI handed over
for free: the pull request's own checks include `Vercel – diji-people-landing`,
`– diji-people-web` and `– diji-people-admin`, which confirms the frontend
deployment target that `docs/deployment/environments.md` had recorded as
"presumed Vercel, not in-repo". Labelled confirmed-from-CI, not
confirmed-from-repository — the build configuration still cannot be read from a
clean clone.

`88e0259` is the integration commit. See Conflicts.

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

The branch was cut from `78072d2`, and **PR #18 and PR #20 both merged into
`main` while this branch sat in CI**. That produced three file conflicts and,
more seriously, two record-id collisions.

| Files | Type | What each side intended |
|---|---|---|
| `docs/backlog/index.md`, `docs/backlog/open.md` | `GENERATED_ARTIFACT` | Both sides regenerated the same indexes from a different record set |
| `docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md` | `GENERATED_ARTIFACT` | Same |
| `docs/bugs/BUG-0030-*`, `docs/backlog/items/ITEM-0025-*` | `CONTRACT` (id namespace) | Not a text conflict — both branches independently allocated the same next free ids |

The id collision is the one worth recording. `new-bug.mjs` and
`new-backlog-item.mjs` allocate by reading the highest existing id, which makes
collisions impossible between **sequential** agents and does nothing about
**concurrent branches**. Both branches were correct in isolation.

## Conflict Resolutions

**Generated artefacts — regenerated, never hand-merged.** `rebuild-backlog.mjs`,
`generate-dashboards.mjs` and `rebuild-tasks.mjs` were run against the union of
both record sets. Choosing either side by hand would have produced an index that
disagreed with the records it indexes, which is the one failure mode these files
exist to prevent.

**Id collision — this branch renumbered, not the other.** The other work had
already merged to `main`; renumbering the merged side would have invalidated
links from records and notes that were already published to the vault. This
branch was still unmerged and therefore the cheap side to move:

```
BUG-0030 → BUG-0031   BUG-0034 → BUG-0035   ITEM-0025 → ITEM-0026
BUG-0031 → BUG-0032   BUG-0035 → BUG-0036   ITEM-0026 → ITEM-0027
BUG-0032 → BUG-0033   BUG-0036 → BUG-0037   ITEM-0027 → ITEM-0028
BUG-0033 → BUG-0034
```

Renames ran in **descending** order so no rename clobbered its successor, and
every cross-reference moved with them — frontmatter `ID` and `Title`, wikilinks
across the seven knowledge notes, the QA run, the implementation record, this
history, `TASK-0002`, six context documents and `ITEM-0011`.

**What would have been lost by choosing the other side:** three files
legitimately carry the *other* task's `[[BUG-0030]]` and `[[ITEM-0025]]` — its
own two records and the `hidden-write-on-read` bug pattern. A blind
find-and-replace across the repository would have silently repointed those at
this task's records, corrupting a bug pattern that describes a defect this task
never touched. They were excluded by explicit file list, not by pattern.

Verified after: every `BUG`/`ITEM` wikilink in `docs/` and `.agent/` resolves,
and no file gained a UTF-8 BOM.

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
| **CI Run ID** | `31958009868` |
| **CI Result** | **PASS** — `CI required gate` green on `88e0259` |

Three runs happened; only the last one authorised anything.

| Run | SHA | Outcome |
|---|---|---|
| `31957159439` | `a35bc4f` | Superseded — cancelled by the concurrency group when the next commit was pushed |
| `31957383812` | `d7c07b7` | PASS — but `main` moved underneath it, so it became a verdict about code that was never merged |
| `31958009868` | `88e0259` | **PASS — this is the verdict that authorised the merge** |

The middle row is the point of the exact-SHA rule. That run was green and it
would have been easy to treat as sufficient; by the time it finished, PR #18 and
#20 had landed and the mergeable tree was different code.

`Lint services/api` failed in every run. It is **report-only, absent from the
gate's `needs` list**, and is the documented pre-existing baseline of two
`@typescript-eslint/unbound-method` errors in `auth.service.spec.ts`. This task
changed no TypeScript file, so it cannot be the cause — recorded as pre-existing,
not inherited silently.

`Browser e2e (report only)` passed in 6m37s.

## Post-Merge Validation

Run against the merged SHA `aed886e`, not the branch:

```
node scripts/validate-framework.mjs      PASS — 714 checks, 0 warnings
node scripts/rebuild-backlog.mjs --check PASS — 65 records, 0 structural errors
node scripts/rebuild-tasks.mjs --check   PASS — 2 tasks, indexes current
node scripts/generate-dashboards.mjs --check  PASS — dashboards current
node scripts/repo-health.mjs             PASS — MAIN_SYNC_STATUS SYNCED
```

No test suite was re-run: the merged diff touches no executable file. Every
changed path is markdown under `docs/`, `.agent/context/`, three `AGENTS.md`
files and `apps/docs/README.md`.

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

`node scripts/sync-obsidian.mjs` ran after the merge, against
`D:/My Work/hrm-dijipeople/DijiPeople-Vault` — verified to be the vault Obsidian
actually has open, by reading `%APPDATA%/obsidian/obsidian.json`, where that
path is the one flagged `"open": true`. Config mappings merged with the defaults
(19 total), so `docs/knowledge/product` and `docs/knowledge/architecture`
published even though the local config does not list them.

**44 files written — 22 created, 22 updated. 137 already current. 5 withheld.**
Vault grew from 181 to 203 notes.

The five withheld are folder READMEs and `docs/tasks/blocked.md`, all rejected
by the empty-note policy in `scripts/lib/obsidian-mappings.mjs` for carrying
nothing beyond a title and headings. That is the policy working.

**Verified on disk rather than inferred from the exit code**, which is the point
worth recording: all ten application notes exist at their expected vault paths,
are substantively populated (611–1,462 words of non-heading content), and are
byte-identical to their repository sources. 112 wikilinks in the seven new
application notes were resolved against the vault's actual note and alias set.

That check found a real defect a successful sync would have hidden: **six of 65
records had no `aliases:` frontmatter line**, so every short-form `[[ITEM-0020]]`
… `[[ITEM-0024]]` and `[[BUG-0029]]` link in the vault was dead. Fixed, with the
mechanical guard raised as [[ITEM-0029]].

## Cleanup

Task worktree — none was created; nothing to remove.

Local branch `agent/knowledge-monorepo-app-documentation` deleted after
verifying it was fully merged into `main` with no unique commits. The remote
branch was deleted by the PR merge.

A second short-lived branch, `agent/knowledge-app-docs-finalization`, carried
this record's completion, the six alias fixes and [[ITEM-0029]] — the merge SHA
cannot be written into the commit that produces it, and `main` is protected, so
finalization is necessarily a follow-up PR. Same pattern as `952997a` for
TASK-0001.
