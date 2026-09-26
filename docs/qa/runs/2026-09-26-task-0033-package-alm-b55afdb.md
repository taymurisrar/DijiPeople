# QA Run — task-0033-package-alm

## Metadata

| | |
|---|---|
| Date / time | 2026-09-26T15:52:57.204Z |
| Branch | `agent/packages-alm` |
| Commit SHA | `b55afdb2d76666126a7a6070114daf2561a39322` |
| Worktree | `D:\My Work\hrm-dijipeople\dp-packages-alm` |
| Environment | Working tree dirty only with this record and the engineering-history record, both being written. Local PostgreSQL 18 throwaway databases `dijipeople_pkgalm_test` (browser stack) and `dijipeople_pkgalm2_test` (fresh, full migration history). No external services. |
| QA agent | architect (orchestrator), acting as QA |
| Scope | Package ALM API, engine and screens (EXECPLAN-0052). Not covered: production data, the admin app, and custom-field *values* on system modules ([[BUG-3697]]). |

## Requirement

Customization packages can be released as immutable versions, exported as a
deterministic `.djpkg`, and imported into another workspace through a staged
flow: analyze, then compare, then conflicts, then plan, then one-transaction
apply. The flow covers upgrade, downgrade blocking, idempotency, uninstall,
environment variables and tenant isolation. Plan:
`docs/plans/EXECPLAN-0052-package-alm.md`. Decision: ADR-0022.

## Risk Areas

- **Tenant isolation.** New tenant-owned models and operation ids are addressed
  by id.
- **Partial imports.** A multi-row apply could half-complete.
- **Untrusted uploads.** The artifact is attacker-controlled input.
- **Ownership.** An import could overwrite Core or another package's components.
- **Destructive schema changes.** For example, a field type change.
- **Migration ordering.** Another session added a same-timestamp migration.

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | DijiPeople Core listed and protected | permission | read-only; export, release, uninstall and delete refused | PASS | e2e "A" |
| S2 | Default Customizations present after provisioning, once | idempotency | exactly one, flagged | PASS | e2e "B"; browser list |
| S3 | Create a package and components in it; the Core module is referenced, not owned | happy | module `create`, Employees `reference` | PASS | e2e "C/D" |
| S4 | The dependency graph finds users | happy | the view uses the field | PASS | e2e "F"; browser Show Dependencies |
| S5 | Release and deterministic export, with no ids or secrets | contract | identical bytes; no tenant, user or row ids | PASS | e2e "G/H"; browser export |
| S6 | Install into UAT | happy | INSTALL; nothing changes before execute; the snapshot includes the module | PASS | e2e "I"; browser review/result |
| S7 | Re-import the same version | idempotency | REINSTALL; zero changes; no duplicate rows | PASS | e2e "M"; browser |
| S8 | Upgrade 1.0.0 → 1.1.0 | happy | NEW / UPDATE / MATCHING per component | PASS | e2e "J" |
| S9 | Downgrade | negative | BLOCKED; execute refused | PASS | e2e |
| S10 | Target owns the logical name | negative | CONFLICT naming the owner; nothing written | PASS | e2e "K" |
| S11 | Tampered, truncated and format-4 files | negative | refused with a reason | PASS | e2e |
| S12 | Missing package dependency | negative | named, with the fix | PASS | e2e |
| S13 | Database refuses one component mid-apply | migration | FAILED, rolled back, failing component named | PASS | e2e rollback |
| S14 | Environment variables | contract | value never exported; import blocked until given; per-environment resolution | PASS | e2e "L" |
| S15 | Uninstall with a dependent and with records | negative | refused with the chain and the records; the dependent uninstalls | PASS | e2e "Q"; browser dialog |
| S16 | Cross-tenant access | tenant | not found everywhere | PASS | e2e "O" |
| S17 | Migration backfill run twice | migration | idempotent; the oldest suffix package adopted | PASS | e2e "R" |
| S18 | Delete a field named by another package's layer | regression | refused with the user named | PASS | e2e "B3" |
| S19 | Import into the authoring workspace | negative | BLOCKED, "authored in this workspace" | PASS | browser |
| S20 | Installed package detail | UI-state | Type Installed; no Release; Uninstall and Detach; Validation "Not applicable" | PASS (after fix) | browser |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npm --workspace api run test` | API unit | 7546 | 0 | 0 | ~6 min |
| `npm --workspace web run test` | web unit | 2039 | 0 | 0 | ~2 min |
| `npx jest --config ./test/jest-e2e.json customization-package-alm` | DB-backed e2e (fresh DB, full history) | 19 | 0 | 0 | ~3 min |
| `npx eslint "{src,test}/**/*.ts" --max-warnings=787` (api) | lint | 0 errors, 787 warnings (the budget) | — | — | — |
| `npx tsc --noEmit` api and web | typecheck | clean | — | — | — |
| `node scripts/validate-framework.mjs` + the 13 framework-job checks | framework | pass | 0 | — | — |
| CI run 36252676338 on b55afdb | CI required gate | PASS | — | — | — |

### Regression-test proof

| Test | With fix | Without fix |
|---|---|---|
| e2e "C/D" module stays `create` (BUG-3702) | PASS | FAIL (mutation) |
| e2e, tenant filter on operations | PASS | FAIL (mutation) |
| comparison: field type change is a CONFLICT | PASS | FAIL (mutation) |
| artifact: component checksum verified | PASS | FAIL (mutation) |
| comparison: another package's ownership is a CONFLICT | PASS | FAIL (mutation) |
| seam spec scans both controllers | PASS | FAIL (mutation) |
| tenant erasure covers the new models | PASS | FAIL (mutation) |

## Manual Validation

A scripted Chromium pass ran against an isolated stack: API on :4099 and web on
:3011, on `dijipeople_pkgalm_test`, with two seeded workspaces, `dijipeople-demo`
(DEVELOPMENT) and `uat-demo` (UAT). It covered:

1. Packages list
2. Create a package
3. Detail tabs
4. Validation
5. Release dialog
6. Versions
7. Export download
8. Import into the source (blocked)
9. Install into UAT
10. Re-import (no changes)
11. Installed detail
12. Uninstall dialog
13. Show Dependencies
14. Phone width

Screenshots are in the session scratchpad; they are not committed.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| REG-483 | Drafts land in a publishable package (BUG-3493) | PASS — the customization spec suite is green; drafts land in Default Customizations |
| REG-635 | Delete safety | PASS |
| REG-636 | Module demotion | PASS |
| REG-637 | Release catches missing dependencies | PASS |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| [[BUG-3702]] | HIGH | Adding a field demoted the package's own module | two writers of one row | REG-636 |
| [[BUG-3699]] | MEDIUM | Delete ignored layer references | two dependency notions | REG-635 |
| [[BUG-3703]] | MEDIUM | Export readiness inert | assertion without a check | REG-637 |
| [[BUG-3704]] | MEDIUM | Settings pages scroll sideways on phones (regression of BUG-1668) | — | deferred |
| [[BUG-3705]] | LOW | Breadcrumb repeats Packages | — | deferred |

Also found and fixed in-branch, not recorded as defects because they were new code:
- a release that could rewind the working version;
- an unreported Core dependency;
- Default Customizations missing for workspaces that pre-date the feature;
- a misleading read-only state for installed packages.

## Known Limitations

- **Production data was never touched.** The backfill was proven on
  legacy-shaped rows in a throwaway database, not on production rows.
- **No production-scale timing.** The import transaction timeout is 120 s, and a
  package of several thousand components has not been measured.
- **The Playwright MCP server was unavailable.** A scripted Playwright run was
  used instead.
- **Admin app untouched**, per D-3.

## Final QA Verdict

**PASS WITH RISKS**

Every automated and scripted scenario passes, including the rollback, isolation
and idempotency cases that only a real database proves. The risks:
- the untimed large-package transaction;
- the backfill running for the first time against production data at release;
- [[BUG-3697]], which means system-module custom fields carry definitions only.

## Follow-up

- BUG-3697 and BUG-3698 need their own plans.
- ITEM-0216 to ITEM-0220 are deferred scope.
- The production release is an owner-triggered RELEASE task.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[ADR-0022]] · [[BUG-1668]] · [[BUG-3493]] · [[BUG-3697]] · [[BUG-3698]] · [[BUG-3699]] · [[BUG-3702]] · [[BUG-3703]] · [[BUG-3704]] · [[BUG-3705]] · [[ITEM-0216]] · [[ITEM-0220]]

<!-- GRAPH:END -->
