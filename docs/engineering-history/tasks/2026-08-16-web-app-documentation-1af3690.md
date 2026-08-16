# Engineering History — Web app documentation

| | |
|---|---|
| **Task Title** | Deep documentation of `apps/web`, the tenant product |
| **Task Type** | KNOWLEDGE (LARGE) — TASK-0003 |
| **Date** | 2026-08-17 |
| **Architect Plan** | `docs/tasks/TASK-0003-deep-documentation-of-apps-web-the-tenant-product.md`. No separate ExecPlan: no product code, schema or contract changed |
| **Agents Used** | Architect (lead, routing + triage), Frontend (structure/runtime), Reviewer + Backend/API (auth/tenant/proxy/security), UI/UX (settings/branding/a11y), QA + Release/DevOps (testing/CI/env/deployment), Integrator, Knowledge Capture. **Not used:** Database (no schema in scope), Integration (no external boundary in scope) |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/knowledge-web-app-documentation` |
| **Base SHA** | `1af3690d8ebe99a14d58d11b6c067286c000c019` |
| **Final Task SHA** | `TODO_FINAL_TASK_SHA` |
| **Target Branch** | `main` |
| **Pull Request** | `TODO_PR` |
| **Merge Commit** | `TODO_MERGE_SHA` |
| **Final Target SHA** | `TODO_FINAL_TARGET_SHA` |

### Commits

`TODO_COMMITS`

### Worktrees

No task worktree — documentation-only, and `docs/development/git-worktrees.md`
reserves worktrees for genuinely concurrent work. Branch cut in the primary
checkout.

### Files Changed

`TODO_FILES_CHANGED`

**One path was deliberately excluded from every commit:**
`.obsidian-sync.example.json` shows as an unstaged deletion in the working tree.
It **pre-exists this task and belongs to someone else**, so it was never staged —
`git add` was used with explicit paths rather than `-A` for exactly this reason.
Its consequence is recorded under Post-Merge Validation.

## Conflicts

`TODO_CONFLICTS`

## Conflict Resolutions

`TODO_CONFLICT_RESOLUTIONS`

## QA

| | |
|---|---|
| **QA Report** | `docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md` — **PASS**, eleven material findings, all triaged |
| **Bug IDs** | Created: BUG-0038 … BUG-0045. BUG-0043 fixed in this task |
| **Backlog Items** | Created: ITEM-0033 … ITEM-0036 |

Four parallel read-only audits were run, split by concern. **Their headline
claims were re-verified independently before becoming records, and three did not
survive unchanged** — a `proxy.ts` line count, a "zero `Tab` handlers" claim
(nine exist; none in a modal, so the conclusion held and the evidence did not),
and a catch-all encoding count (17, not 14). One of my own measurements was also
wrong and was corrected in the same run. All three corrections are recorded in
the QA run rather than quietly absorbed.

## CI

| | |
|---|---|
| **CI Run ID** | `TODO_CI_RUN` |
| **CI Result** | `TODO_CI_RESULT` |

## Post-Merge Validation

`TODO_POST_MERGE`

**Known local-only failure, not a task defect:** `node
scripts/validate-framework.mjs` reports `required path present:
.obsidian-sync.example.json` as failing in this working tree, because that
tracked file is deleted-but-unstaged by someone else. `git cat-file -e
HEAD:.obsidian-sync.example.json` confirms it is present in the committed tree,
so CI — which checks out the commit — is unaffected. Verified rather than
assumed.

## Release / Deployment Impact

**None — not deployed.** No product code, schema, migration, environment
variable or contract changed. `DEPLOYMENT_STATUS = NOT_REQUIRED`.
`DEPLOYMENT_DRIFT_STATUS = UNKNOWN` — the repository still cannot read a
deployed SHA ([[ITEM-0010]]).

## Knowledge Capture

Implementation record:
`docs/knowledge/implementations/2026-08-17-web-app-documentation.md`.

New: `docs/knowledge/architecture/web-architecture.md`.
Updated in place: `docs/knowledge/modules/tenant-application.md`,
`docs/knowledge/modules/README.md`.
Documentation corrected: `apps/web/AGENTS.md`, `apps/web/README.md`,
`apps/admin/README.md`.

`FEEDBACK_PROMOTION_STATUS = NOT_REQUIRED` — the user requested the task and made
no correction during it.

## Obsidian Sync

`TODO_OBSIDIAN`

## Cleanup

`TODO_CLEANUP`
</content>
