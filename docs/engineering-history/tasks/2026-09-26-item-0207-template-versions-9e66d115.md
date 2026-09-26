# Engineering History — Item 0207 template versions

| | |
|---|---|
| **Task Title** | ITEM-0207 seeded agreement templates publish new versions; ADR-0023; close ITEM-0208; ITEM-0210 decision |
| **Task Type** | FEATURE (SMALL) with RELEASE to main |
| **Date** | 2026-09-26 |
| **Architect Plan** | NOT_APPLICABLE — owner decision recorded as ADR-0023; one seed function changed |
| **Agents Used** | Architect (implementation, ADR, release, deployment verification). Not used: other specialists — single-function change |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/item-0207-template-versions` |
| **Base SHA** | `ded97db5244ffaed2bee18b935b034e38e66b450` |
| **Final Task SHA** | `9e66d11543a2d1630ac48c683e0de37fef817d3f` |
| **Target Branch** | `main` |
| **Merge Commit** | `9e66d115` — PR #85 merged `develop` (`ded97db5`) into `main`; `develop` fast-forwarded to it |
| **Final Target SHA** | `9e66d11543a2d1630ac48c683e0de37fef817d3f` on both `main` and `develop` (this records commit follows through a `[skip render]` PR) |

### Commits

```
9e66d115 Release: seeded agreement templates publish new versions (#85)
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            d055fc71 [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             2a1a1e06 [agent/attendance-location-capture]
D:/My Work/hrm-dijipeople/dijipeople-audit                      911be0fa [agent/full-technical-audit]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-closeout                   caad4a56 [agent/closeout-sweep]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-monitoring                 c18b5024 [agent/prod-monitoring-triage]
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-r2-storage                 2d86d506 [agent/r2-durable-storage]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/dp-0207                               9e66d115 [agent/item-0207-template-versions]
D:/My Work/hrm-dijipeople/dp-field-values                       ded97db5 [agent/custom-field-values]
D:/My Work/hrm-dijipeople/dp-plans-review                       516b6ede [agent/review-subscription-plans-screen]
D:/My Work/hrm-dijipeople/dp-s1-openbugs                        6b87e8fa [agent/cs-s1-openbugs]
D:/My Work/hrm-dijipeople/dp-s10-pii                            484e44c4 [agent/cs-s10-pii]
D:/My Work/hrm-dijipeople/dp-s2-decisions                       3da4a860 [agent/cs-s2-decisions]
D:/My Work/hrm-dijipeople/dp-s3-itemsa                          7017d36f [agent/cs-s3-itemsa]
D:/My Work/hrm-dijipeople/dp-s4-itemsb                          1df6f9e8 [agent/cs-s4-itemsb]
D:/My Work/hrm-dijipeople/dp-s5-security                        eaf29471 [agent/cs-s5-security]
D:/My Work/hrm-dijipeople/dp-s6-triaged                         f3f0977b [agent/cs-s6-triaged]
D:/My Work/hrm-dijipeople/dp-s7-planbugs                        00a5058a [agent/cs-s7-planbugs]
D:/My Work/hrm-dijipeople/dp-s8-planitems                       7b197797 [agent/cs-s8-planitems]
D:/My Work/hrm-dijipeople/dp-s9-auditrecords                    7977a9fd [agent/cs-s9-auditrecords]
D:/My Work/hrm-dijipeople/dp-ux-findings                        b7bd1ca7 [agent/ux-findings-sweep]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

0 file(s) against `ded97db5`.

```
(no differences against the base)
```

## Conflicts

None. `main` was an ancestor of `develop`.

Write `None.` if the merge was clean. Do not omit the section.

## Conflict Resolutions

None — no conflicts.

## QA

| | |
|---|---|
| **QA Report** | Spec `seed-config-template-versions.spec.ts` (mutation-checked) and a throwaway-database run: second `seed:config` writes nothing; a changed template publishes v2 and keeps v1 |
| **Bug IDs** | None |
| **Backlog Items** | Closed DONE: ITEM-0207, ITEM-0208 (owner-resolved). ITEM-0210 decided (ADR-0023), BLOCKED on Safepay merchant credentials |

## CI

| | |
|---|---|
| **CI Run ID** | 36262433688 on `ded97db5` plus the PR #85 pull_request run |
| **CI Result** | PASS on the exact merged head |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Merged tree equals `develop` at `ded97db5`. Locally: API tsc PASS; API jest 400 suites / 7,551 tests PASS; ESLint 787 (ceiling); validate-framework 6,152 checks PASS. Post-deploy: `/api/health` commit `9e66d11`; public legal and commercial-config 200; every system template still has exactly one published version (the new seeding wrote nothing, as expected).

## Release / Deployment Impact

Deployed to production: Render build, pre-deploy (migrate + seeds) and update succeeded, live on `9e66d115`; Vercel web, admin and landing READY on `9e66d115`. No migration. Safepay unchanged (off; no credentials on the service). Rollback class: code revert.

## Knowledge Capture

No `docs/knowledge/` change; `docs/architecture/agreements.md` documents the seeded-version rule and ADR-0023 records both decisions.

## Obsidian Sync

Ran `knowledge:sync` and `knowledge:verify` at `9e66d115` before filing this record; verify reported only pre-existing problems, none from this task.

## Cleanup

Worktree `dp-0207` removed with `npm run worktree:remove` and branch `agent/item-0207-template-versions` deleted after this records commit is integrated; the throwaway database `dijipeople_item0207_test` was dropped.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[ADR-0023]] · [[ITEM-0207]] · [[ITEM-0208]] · [[ITEM-0210]]

<!-- GRAPH:END -->
