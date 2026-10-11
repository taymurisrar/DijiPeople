# Engineering History — Platform Admin UX cleanup

| | |
|---|---|
| **Task Title** | Platform Admin UX, functional and technical cleanup (dashboard header, record header, command bar, fields, location cascade, agreement editor, list columns, tenants grid, monitoring) |
| **Task Type** | FEATURE (UI/UX), with BUGFIX |
| **Date** | 2026-10-08 |
| **Architect Plan** | NOT_APPLICABLE. The work was UI and API changes with no schema change and no destructive change, so no PLANS.md change class applied. Scope was tracked on SESSION-0120. |
| **Agents Used** | The Architect implemented the shared runtime work: record header, command bar, field display, location cascade, list columns, tenants grid and dashboard. Two subagents ran in parallel on disjoint files: Monitoring (API platform-monitoring and admin monitoring) and the agreement editor (contracts placeholder registry, signatures, sticky rail). The Architect integrated their work, ran the browser review, and fixed what that review found. No separate Security or Database agent was used: there was no schema change, the new public endpoint follows the existing rate-limited geography controller, and the Monitoring drawer re-sanitises on the server. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/admin-ux-cleanup` |
| **Base SHA** | `c419770a65fbb0348eeb4d2c94a8aae9d279b296` |
| **Final Task SHA** | `8ab5c3da45eac72c303c1b7bd0d9c4354fa88e58` |
| **Target Branch** | `develop`, then `main` through release PR #103 |
| **Merge Commit** | `32c4b3146bb8c05c93f37414389556281904ad6b` (PR #103, develop into main) |
| **Final Target SHA** | `32c4b314`. `main` and `develop` were both at this SHA after the fast-forward. |

### Commits

```
f6f27153 feat(admin): Platform Admin UX cleanup — shared record header, overflow command bar, field layout, location cascade, agreement editor, tenants grid, monitoring
8ab5c3da test(e2e): tenant list identity column is labelled Tenant (BUG-4033)
32c4b314 Merge pull request #103 from taymurisrar/develop
```

### Files Changed

85 files changed against `c419770a`:

- **Admin runtime:**
  - components: `module-action-bar`, `record-highlight-header`, `record-status-group`, `runtime-form`, `runtime-module-list`, `runtime-view-selector`, `runtime-record-page`, `crm/data-table`
  - lib: `command-overflow`, `runtime-lookups`, `platform-module-registry`
- **Admin screens:**
  - dashboard, tenants header, partner reviews, invoice detail
  - monitoring (rebuilt)
  - documents (agreement editor)
  - `globals.css`
- **API:**
  - `lookups` (public cities endpoint, resolution by name)
  - `platform-monitoring` (query DTO, facets, re-sanitisation)
  - `contracts` (subject-aware placeholder registry, signature token normalisation)
- **Tests:** new admin and API specs, and the Flow G e2e.
- **Records and generated artifacts.**

## Conflicts

None. `develop` did not move during the task, so both integrations were fast-forwards.

## Conflict Resolutions

None. The merge was clean.

## QA

| | |
|---|---|
| **QA Report** | Browser review on an isolated stack: API on port 4099 and admin on port 3012, against `dijipeople_adminux_test`, a clone of the dev database. Screens covered: dashboard, lead, customer, tenant, partner, Tenants list, Monitoring, and the template editor. Widths: 1100, 1280, 1366 and 1920. Verdict: PASS after the fixes below. |
| **Bug IDs** | BUG-4032, BUG-4033, BUG-4034 and BUG-4035, all FIXED with REG-663 to REG-666. Scenarios: QA-ADMINUX-001 to QA-ADMINUX-003 and QA-MON-001. |
| **Backlog Items** | None created. |

Findings from the browser pass that were fixed before merge:

- A missing React key on the owner cell.
- A disabled primary Save that was drawn as a grey box.
- A duplicate "platform" tenant option in Monitoring.
- The stack trace block picking up the brand colour through the `bg-slate-950` theme remap.
- All sticky positioning broken by root overflow (BUG-4032).
- The agreement panel sliding under the toolbar at the end of a document.

## CI

| | |
|---|---|
| **CI Run ID** | 37856720101 (exact SHA `8ab5c3da`) |
| **CI Result** | PASS. The previous run, 37855176775 on `f6f27153`, failed only in Flow G, whose e2e asserted the old "Name" header. The spec was updated to "Tenant" in `8ab5c3da`. |

## Post-Merge Validation

`32c4b314` is a merge commit whose tree equals the CI-verified `8ab5c3da` plus `main`'s history; `develop` already contained `main`. Local runs on the final tree:

- Admin: jest 75 suites and 870 tests pass, plus the new specs; tsc is clean; `next build` passes.
- API: jest 8,020 of 8,021 pass. `mfa.service.spec` is a known timing flake under full-suite load and passes on its own (21 of 21).
- API: `check-types` is clean; eslint reports 786 warnings against a budget of 787.
- `validate:framework` passes 6,393 checks, and every generator `--check` is current.

## Release / Deployment Impact

Merged to `main` through PR #103, which triggers the production deploy. No Prisma migration and no new environment variables. Rollback class: revert the merge commit. There is no data rollback.

The new public endpoint is `GET /public/geography/cities`. It is rate limited, takes a bounded `country` and an optional `state`, and returns at most 200 rows.

Deployed commit is to be verified at `/api/health`.

## Knowledge Capture

`docs/knowledge/regressions/sticky-broken-by-root-overflow.md`, category `regressions`: why `overflow-x: hidden` on both `html` and `body` disables every sticky element, how to detect it, and the "sticky cannot outlive its container" corollary.

## Obsidian Sync

Not run from this worktree, which has no vault configuration. The records are Git-tracked, and the next `knowledge:sync` publishes them.

## Cleanup

Isolated dev servers stopped. The throwaway database `dijipeople_adminux_test` is kept by convention. The task worktree is kept until this record lands; it is then removed with the guard script, not `git worktree remove`.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-4032]] · [[BUG-4033]] · [[BUG-4034]] · [[BUG-4035]] · [[QA-ADMINUX-001]] · [[QA-ADMINUX-003]] · [[QA-MON-001]] · [[SESSION-0120]]

<!-- GRAPH:END -->
