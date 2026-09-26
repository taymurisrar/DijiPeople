# Engineering History — TASK-0033 package ALM

| | |
|---|---|
| **Task Title** | Package ALM: versions, portable artifact, staged import, upgrade, uninstall ([[TASK-0033]]) |
| **Task Type** | FEATURE (with MIGRATION) |
| **Date** | 2026-09-26 |
| **Architect Plan** | `docs/plans/EXECPLAN-0052-package-alm.md` — approved by the owner 2026-09-26 with decisions D-1..D-3 |
| **Agents Used** | Four read-only discovery agents (customization storage, releases/provisioning, customization UI, RBAC/audit recipe); architect implemented database, backend, frontend, security review, QA and integration directly. Not used: integration (no external system), release/devops (no deployment — owner-triggered release) |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/packages-alm` |
| **Base SHA** | `60f4b5fd` at start; rebased onto `254af088` (Safepay release) before integration |
| **Final Task SHA** | `b55afdb2d76666126a7a6070114daf2561a39322` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — fast-forward. `git push origin b55afdb2:develop` (ff from 254af088) |
| **Final Target SHA** | `b55afdb2d76666126a7a6070114daf2561a39322` |

### Commits

```
b55afdb2 chore(TASK-0033): regenerate the Engineering Control Center
54fcac43 docs(TASK-0033): task progress WP-01..WP-07 done; plan divergences recorded
4523542e chore(TASK-0033): keep the API within its lint budget; regenerate component index and screen map
c823ef5c chore(TASK-0033): order the package ALM migration after Safepay's; regenerate schema-derived artifacts
f1bccbb5 docs(TASK-0033): ADR-0022, package ALM architecture, bug and backlog records, QA scenario
d5289e0a fix(customization): browser-pass fixes — Default Customizations always present; accurate read-only state for installed packages (TASK-0033)
b4296862 feat(web): package lifecycle UI — release, versions, dependencies, deployments, environment, import wizard (TASK-0033)
b5e971c9 fix(customization): refuse deleting a field, form or view another package's layer still names (TASK-0033, B3)
60c94e50 test(customization): DB-backed package ALM round trip; fix module demotion and release ordering (TASK-0033)
0b5b7e7d feat(customization): package ALM engine and API — release, export, staged import, uninstall (TASK-0033)
7a6c2855 feat(customization): WP-01 package ALM schema, migration and backfill (TASK-0033)
```

82 files changed, 16,769 insertions, 345 deletions against 254af088 (most of the insertions are the regenerated 4.5 MB runtime schema JSON and the e2e suite).

## Conflicts

Rebase onto `origin/develop` (8 new commits, including Safepay billing):

1. `services/api/prisma/schema.prisma`, model Subscription — **formatting vs content**. My WP-01 commit had run `prisma format`, re-aligning the Subscription block; develop added `paymentProvider` and `gracePeriodEndsAt` there.
2. `services/api/prisma/migrations` — **ordering**. No textual conflict, but develop added `20260926120000_payment_provider_and_safepay`, the same timestamp as `20260926120000_customization_package_alm`.
3. Generated indexes (backlog, QA, sessions, dashboards, remediation inventory, data-model notes) — **generated-artifact**.
4. `docs/qa/regressions/index.md` — **append/append**: develop added REG-633/634, this task REG-635..637.

## Conflict Resolutions

1. Took develop's schema verbatim and re-inserted only this task's blocks (Tenant relations, enums, CustomizationSolution and the six new models), verified by `migrate diff` equalling the migration SQL. Keeping my side would have silently dropped the two Safepay fields; a whitespace-insensitive patch was tried first and rejected because it lost an exact line in Tenant.
2. Renamed this task's migration to `20260926180000_customization_package_alm` so it sorts after Safepay's; proven by `migrate deploy` on a fresh database (19/19 e2e). Keeping the old name would apply it before a migration other databases already hold.
3. Took develop's side and re-ran every generator. Hand-merging would give indexes matching neither branch.
4. Kept develop's entries and appended REG-635..637; the ids were checked against every branch first.

## QA

| | |
|---|---|
| **QA Report** | `docs/qa/runs/2026-09-26-task-0033-package-alm-b55afdb.md` — **PASS WITH RISKS** |
| **Bug IDs** | Created: [[BUG-3697]], [[BUG-3698]], [[BUG-3700]], [[BUG-3701]], [[BUG-3704]], [[BUG-3705]] (triaged, open/deferred); [[BUG-3699]], [[BUG-3702]], [[BUG-3703]] (FIXED, REG-635..637) |
| **Backlog Items** | Created and deferred: [[ITEM-0216]], [[ITEM-0217]], [[ITEM-0218]], [[ITEM-0219]], [[ITEM-0220]] |

## CI

| | |
|---|---|
| **CI Run ID** | 36252676338 |
| **CI Result** | PASS — `CI required gate` on b55afdb2, the exact SHA fast-forwarded into develop |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

develop was fast-forwarded to the CI-verified SHA, so the merged tree *is* b55afdb2. Run against it: API unit 7546/7546, web unit 2039/2039, DB-backed e2e 19/19 on a fresh database with the full migration history, API lint 787/787 warnings (budget), api and web tsc clean, validate:framework and the 13 framework-job checks passing.

## Release / Deployment Impact

None — not deployed. Integrated into develop only; main untouched at 562dee91. Rollback class DATABASE_ADDITIVE + DATA_MIGRATION (idempotent backfill). At release: API with migration first, then web; seed:config carries the three new permission keys to existing tenants.

## Knowledge Capture

- `docs/knowledge/modules/customization.md` (new) — module knowledge: services, business rules, gaps.
- `docs/architecture/customization-packages.md` (new) — architecture and troubleshooting.
- ADR-0022 (decision). Pointer added in `docs/architecture/module-runtime-overhaul.md`.
- Agent memory: API lint warning budget; migration timestamp collisions and `prisma format` churn; the isolated tenant-web stack recipe.

## Obsidian Sync

PENDING

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dp-packages-alm` kept until this record reaches develop; it is then retired with `scripts/remove-worktree.mjs` (never `git worktree remove`). Throwaway databases `dijipeople_pkgalm_test` and `dijipeople_pkgalm2_test` dropped. Isolated API/web servers stopped. The worktree's gitignored `.env` / `.env.local` go with the worktree.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[ADR-0022]] · [[BUG-3697]] · [[BUG-3698]] · [[BUG-3699]] · [[BUG-3700]] · [[BUG-3701]] · [[BUG-3702]] · [[BUG-3703]] · [[BUG-3704]] · [[BUG-3705]] · [[ITEM-0216]] · [[ITEM-0217]] · [[ITEM-0218]] · [[ITEM-0219]] · [[ITEM-0220]] · [[TASK-0033]]

<!-- GRAPH:END -->
