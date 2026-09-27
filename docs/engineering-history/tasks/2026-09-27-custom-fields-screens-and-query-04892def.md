# Engineering History — Custom fields screens and query

| | |
|---|---|
| **Task Title** | Custom fields screens and query |
| **Task Type** | FEATURE (+ BUGFIX: BUG-3800, BUG-3809, BUG-3154 partial) and its RELEASE — TASK-0036, SESSION-0116 |
| **Date** | 2026-09-27 |
| **Architect Plan** | NOT_APPLICABLE for an ExecPlan: no schema change, migration or permission change. Decision ADR-0025 (sort/filter by custom fields); the owner chose the scope ("Screens for API-only modules", "Sort/filter by custom fields"). |
| **Agents Used** | backend-api, frontend, security, qa, reviewer, integrator, knowledge-graph, release-devops. Three Sonnet subagents: the claims editor, the onboarding template editor, and the 13-table e2e. Not used: database (no schema change), integration (no external system). |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/custom-fields-screens-and-query` |
| **Base SHA** | `7d81099922023b77c205e68456831f44f880c8ef` |
| **Final Task SHA** | `8f7049a95c425454b02cdd0a7cb5354409f7e53a` |
| **Target Branch** | `develop`, then `main` by release PR #91 |
| **Merge Commit** | `04892def` — PR #91 (develop → main), merge commit; `develop` fast-forwarded to it |
| **Final Target SHA** | `04892defdaa3d100bf827d9a63caf6547644a95d` (`main` and `develop`) |

### Commits

```
92386e1a fix(api): business units and payroll calendars/periods accept the lookup query (BUG-3800)
06cdfab5 feat: document types get an edit route and a settings screen; tenants can no longer create shared types or categories (TASK-0036, BUG-3809)
a636b7db feat(employees): Pay setup tab for EmployeeCompensation; encrypt its secrets (TASK-0036, BUG-3154)
32b5b42c feat(employees): sort and filter the employee list by custom fields (TASK-0036, ADR-0025)
c13fe597 feat(web): claim create/edit with line items; onboarding template editor (TASK-0036)
06fb5dc4 docs(records): TASK-0036 — BUG-3800 and BUG-3809 fixed (REG-641/642, QA-SETTINGS-036, QA-TENANT-066), BUG-3154 partial, ADR-0025, regenerated indexes
34d34b66 test(api): custom fields on the thirteen bound tables that had no demo data (TASK-0036)
4a311f73 fix(employees): a custom-field orderBy was never recognised (TASK-0036)
e21b7574 fix(web): three defects the TASK-0036 browser pass found in the new screens
b062638a docs(records): TASK-0036 — QA run (PASS WITH RISKS), WP-07 done, ADR-0025 corrected to observed behaviour
8f7049a9 fix(web): attribute the Document Types settings page to the Documents entitlement (TASK-0036)
```

### Worktrees

`D:/My Work/hrm-dijipeople/dp-cf-screens` on `agent/custom-fields-screens-and-query`. The primary checkout stayed on `develop`, clean, and was never written to.

### Files Changed

97 files, +6413 / −206, against `7d810999`: API (organization, payroll, documents, employees, customization, onboarding), web (employees, claims, me/claims, onboarding, settings) and records.

## Conflicts

None. `develop` did not move during the task; both the develop push and the PR were fast-forwards from `7d810999`.

## Conflict Resolutions

None — no conflicts. One working-tree collision instead: I ran `git stash` while two subagents were writing into the same worktree. The stash took their tracked edits, and `stash pop` then refused on two claims files. Those files differed from the stashed copies only in line endings, so I checked them out and the pop succeeded; nothing was lost. The lesson is now in memory as never-stash-a-worktree-agents-share.

## QA

| | |
|---|---|
| **QA Report** | `docs/qa/runs/2026-09-27-custom-fields-screens-and-query-e21b757.md` — PASS WITH RISKS (document types not browser-verified: plan-gated for the demo tenant) |
| **Bug IDs** | BUG-3800 FIXED (REG-641, QA-SETTINGS-036); BUG-3809 found and FIXED (REG-642, QA-TENANT-066); BUG-3154 partially fixed, still OPEN |
| **Backlog Items** | None created or closed |

Defects found and fixed in this task's own unmerged code, before integration:
- The custom-sort pattern lost its backslash (`s+` for `\s+`), so every custom sort fell back to name order. Both ends had passing tests; a live API check found it (4a311f73).
- The new-claim form was fully disabled, the new claim's currency was empty behind a "USD" placeholder, and custom filters were dropped when `USE_ENTITY_DATA_API` is on. The browser pass found all three (e21b7574).
- The Document Types page had no entitlement attribution. The first CI run failed on it; local runs had covered only part of the web suite (8f7049a9).

## CI

| | |
|---|---|
| **CI Run ID** | 36318590482 on `8f7049a9`, the head SHA pushed to `develop` and merged by PR #91 (the earlier run 36317657323 on `b062638a` FAILED on Web tests) |
| **CI Result** | PASS — `CI required gate` green on the exact SHA |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

`develop` and `main` hold the tree CI passed on `8f7049a9`. Production checks after the deploy:

| Check | Result |
|---|---|
| `/api/health` | commit `04892def` |
| Render deploy | live `04892def`, finished 2026-09-27T12:41:52Z |
| `/api/public/legal` | 200 |
| `/api/employees?customFilters=[]`, `/api/documents/types/:id`, `/api/onboarding/templates/:id` (unauthenticated) | 401 — the routes exist and are guarded |
| app, admin and www | 200 |

Vercel `diji-people-web`, `diji-people-admin` and `diji-people-landing` are Ready on the release.

## Release / Deployment Impact

Deployed to production by PR #91 (`main` at `04892def`), under the standing deploy authorization of 2026-08-31.

**No migration and no schema change.** Rollback class: CODE_ONLY.
- Reverting removes the screens, the list query and the lookup parameters.
- The BUG-3809 refusal would also go, which reopens the cross-tenant write.
- EmployeeCompensation rows written since the release keep their `*Enc` copies, which the older code ignores.

Open: tenants may already have created global document types or categories in production before this fix. Checking needs a read-only production query and the owner's go-ahead.

## Knowledge Capture

- **ADR-0025**: the design of custom-field sort and filter (record-id sets, bound parameters, queryable fields, both list paths).
- **ADR-0024**: its "not sortable or filterable server-side" consequence is marked superseded for the employee list.
- **Memory**: never-stash-a-worktree-agents-share (new), employee-list-has-two-data-paths (new), and shell-heredocs-mangle-markdown (the regex backslash case).
- **Tests that enforce the lessons**: the orderBy seam spec, needsCustomFieldQuery and isClaimFormEditable.

## Obsidian Sync

`knowledge:sync` at `04892def` wrote 34 notes. The first `knowledge:verify` flagged this note as GRAPH_ORPHAN before its record links were generated. After `generate-record-graph`, the sync wrote 11 notes and `knowledge:verify` gave **PASS**.

## Cleanup

- The throwaway database `dijipeople_bp36_test` is dropped. `dijipeople_cs_test` is dropped at closure.
- API :4099 and web :3011 are stopped, and the copied `services/api/.env` and `apps/web/.env.local` are deleted.
- Worktree `dp-cf-screens` is removed with the guard script, and branch `agent/custom-fields-screens-and-query` is deleted, once this closure commit is integrated.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[ADR-0024]] · [[ADR-0025]] · [[BUG-3154]] · [[BUG-3800]] · [[BUG-3809]] · [[QA-SETTINGS-036]] · [[QA-TENANT-066]] · [[SESSION-0116]] · [[TASK-0036]]

<!-- GRAPH:END -->
