# Engineering History — Settings plan entitlements

| | |
|---|---|
| **Task Title** | Settings plan entitlements |
| **Task Type** | BUGFIX, with a FEATURE second round — BUG-2958, then three capabilities carved out |
| **Date** | 2026-09-09 |
| **Architect Plan** | [`EXECPLAN-0031`](../../plans/EXECPLAN-0031-plan-scoped-settings-visibility.md) — written first, then corrected: its baseline was measured in the stale primary checkout |
| **Agents Used** | Architect, Frontend, Backend/API, Security, Product & Backlog Steward, Integrator. **Not used:** Database (no schema change, no migration), Integration (no gateway, Stripe, agent or email contract change), Release/DevOps (develop only, no deployment) |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/settings-plan-entitlements` |
| **Base SHA** | `4d0635a0b99099af12826b9bb1b08a9c90774269` |
| **Final Task SHA** | `c3627cadf3baa6689a236639d9dcef1675f05d50` |
| **Target Branch** | `develop` — `main` untouched, as an ordinary task requires |
| **Merge Commit** | None — fast-forward. `git push origin c3627cad:develop` moved the tip to the exact SHA CI verified, so no merge commit exists and the CI evidence applies to the integrated result directly |
| **Final Target SHA** | `c3627cadf3baa6689a236639d9dcef1675f05d50` |

### Commits

```
1b020d29 docs(plan): EXECPLAN-0031 — plan entitlements gate the settings IA
2466afc4 fix(settings): plan entitlements gate the settings IA (BUG-2958)
83b2afec test(settings): resolve every shipped plan, and record what the gate cannot cover
71c47233 feat(settings): carve out three capabilities, and flatten without moving anything
c3627cad fix(super-admin): annotate the catalog key set so the backfill compiles
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            c22889ab [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             2a1a1e06 [agent/attendance-location-capture]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-monitoring                 c18b5024 [agent/prod-monitoring-triage]
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-settings-plan              c3627cad [agent/settings-plan-entitlements]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

41 file(s) against `origin/main`.

```
A	apps/web/app/(authenticated)/_components/tenant-entitlements-provider.tsx
M	apps/web/app/(authenticated)/layout.tsx
A	apps/web/app/(authenticated)/settings/_components/settings-entitlement-boundary.tsx
A	apps/web/app/(authenticated)/settings/_components/settings-plan-state.tsx
M	apps/web/app/(authenticated)/settings/_components/settings-runtime-landing.tsx
M	apps/web/app/(authenticated)/settings/_components/settings-runtime-nav.tsx
A	apps/web/app/(authenticated)/settings/_lib/settings-entitlements.spec.ts
A	apps/web/app/(authenticated)/settings/_lib/settings-entitlements.ts
M	apps/web/app/(authenticated)/settings/_lib/settings-runtime.ts
M	apps/web/app/(authenticated)/settings/layout.tsx
M	apps/web/lib/security-keys.ts
M	docs/backlog/completed.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0126-decide-which-of-the-41-always-visible-settings-pages-should-.md
A	docs/backlog/items/ITEM-0127-settings-ia-21-of-41-groups-hold-a-single-item.md
M	docs/backlog/open.md
A	docs/bugs/BUG-2958-settings-shows-every-category-group-and-page-regardless-of-t.md
A	docs/decisions/ADR-0005-settings-capability-attribution.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
A	docs/plans/EXECPLAN-0031-plan-scoped-settings-visibility.md
M	docs/qa/coverage-matrix.md
A	docs/qa/known-bug-patterns/gate-scoped-to-one-structure.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-SETTINGS-017-settings-visibility-follows-the-tenant-s-plan-entitlements.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-021-settings.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0094-plan-scoped-settings-visibility-entitlement-gating-for-setti.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	package.json
M	services/api/package.json
A	services/api/prisma/repair-plan-capabilities.ts
M	services/api/src/common/constants/tenant-features.ts
M	services/api/src/modules/super-admin/commercial-bootstrap.ts
A	services/api/src/modules/super-admin/plan-capability-backfill.spec.ts
M	services/api/src/modules/super-admin/plans.catalog.ts
M	services/api/src/modules/tenant-settings/tenant-settings.catalog.ts
```

## Conflicts

None. `develop` did not move between the branch being cut at `4d0635a0` and the
push, so integration was a fast-forward with nothing to reconcile.

Worth recording that this was circumstance rather than design: five other
sessions were ACTIVE on `develop` throughout, and `session.mjs check` was run
before planning and again before the code, reporting `SAFE_PARALLEL` both
times.

## Conflict Resolutions

None — there were no conflicts.

## QA

| | |
|---|---|
| **QA Report** | None. Automated coverage is in place and passing; the live pass is written as [`QA-SETTINGS-017`](../../qa/scenarios/QA-SETTINGS-017-settings-visibility-follows-the-tenant-s-plan-entitlements.md) and has **not** been run against a running stack. Its steps 7 to 10 — change the plan in Platform Admin, confirm the tree follows with no deploy, confirm downgraded data survives — are the half no unit test can prove |
| **Bug IDs** | `BUG-2958` created and fixed. `BUG-1952` referenced, not reopened — its API half was already `FIXED` at the real baseline |
| **Backlog Items** | `ITEM-0126` created and closed DONE (three capabilities carved out). `ITEM-0127` created, partly addressed, left DEFERRED for the regrouping it deliberately does not do. `ITEM-0110` answered by ADR-0005 Decision 1 |

## CI

| | |
|---|---|
| **CI Run ID** | `34349910890` on `c3627cad` — the exact SHA pushed to `develop` |
| **CI Result** | PASS. Four earlier verdicts on this branch: `1b020d29` FAILED (stale record graph), `2466afc4` SUPERSEDED, `83b2afec` PASS, `71c47233` FAILED (five jobs, one type error) |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run in the task worktree at `c3627cad`, which is byte-identical to `develop`
after the fast-forward — so these validate the integrated result and not merely
the branch.

| Command | Result |
|---|---|
| `npm --workspace web run test` | PASS — 1598 tests, 71 suites |
| `npm --workspace api run test -- tenant-features entitlement plan-capability-backfill plans commercial-bootstrap` | PASS — 86 tests, 7 suites |
| The full CI `Framework validation` job, all fifteen steps | PASS |
| `npx eslint` (apps/web) | PASS — 0 errors, 24 pre-existing warnings |
| `npm --workspace api run check-types` | One error, environmental — see below |

**Two local checks could not be trusted, and CI is the authority for both.** The
task worktree's `node_modules` is a junction to the primary checkout, so
`@repo/config` and the generated Prisma client resolve to a tree sixteen commits
older. That produces one web typecheck error in `next.config.ts`, one API
typecheck error on `EmailDeliveryStatus.NOT_DELIVERED`, one failing API spec on
the same enum, and four extra `no-unsafe-*` lint warnings. All four reproduce
with this branch's changes stashed. CI installs cleanly, generates the client,
and passed.

That shortcut also cost a CI cycle. `71c47233` failed five jobs on one type
error, and the reason it was missed is worth keeping: tests and lint were run
after the last code change but the API typecheck was not, and a non-empty
typecheck output had stopped reading as a signal because one known error was
always there.

## Release / Deployment Impact

None — not deployed. `develop` only; `main` untouched.

`ROLLBACK_CLASS: CODE_ONLY`. No schema change, no migration, no data change and
no external contract change, so reverting the range restores prior behaviour
exactly.

Two things a future release task must do, in this order:

1. **API before web.** Between the two deploys a tenant would see a settings page
   the API refuses — visibly broken, but safe. Shipping web first hides pages the
   API still serves, which is the original bug with the sign flipped.
2. **`npm run repair:plan-capabilities` after `seed:config`.** The three
   carved-out keys reach the four catalog plans through `reconcilePlanFeatures`;
   plans an operator created by hand are never reconciled and would otherwise
   silently lose three capabilities their tenants use today.

## Knowledge Capture

One new bug pattern:
[`gate-scoped-to-one-structure`](../../qa/known-bug-patterns/gate-scoped-to-one-structure.md)
— a cross-cutting rule enforced by walking one structure cannot reach a second
structure that expresses the same concept another way, so "the gate is built" and
"the surface is gated" are different claims.

Its sharpest instance is in this task. The register that gates API modules
exempts `branding` on the written grounds that it is "enforced where settings
resolve", and nothing was enforcing where settings resolve. An exemption that
names its enforcer is a claim to verify, not a decision to trust.

Two further lessons live in that pattern rather than as notes of their own: audit
the built artifact and not the lookup table (the first attribution map was
written against `itemPlacement` and was wrong in both directions, carrying four
keys for pages that no longer exist and missing three that fall through to a
default), and a baseline measured in the wrong worktree yields a plan that is
internally coherent and externally wrong.

Also `REG-396` in the regression register, and `ADR-0005` recording eight
capability-attribution decisions across two rounds.

## Obsidian Sync

Ran. 29 files written, 1220 already current, 6 skipped as empty. The generated
folders touched were the bug, backlog, decision, QA and dashboard trees — the
records this task created or advanced.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-settings-plan` removed through
`scripts/remove-worktree.mjs`, after first removing the `node_modules` junctions
it carried. That order is not optional: a recursive delete follows a junction,
and doing it the other way round has previously emptied thousands of tracked
files out of the user's primary checkout.

The primary checkout was left exactly as found — three paths dirty before this
task began (`apps/landing/app/partners/partner-inquiry-form.tsx`,
`bash.exe.stackdump`, and an untracked tenant-settings spec), all the user's,
none touched.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-1952]] · [[BUG-2958]] · [[EXECPLAN-0031]] · [[ITEM-0110]] · [[ITEM-0126]] · [[ITEM-0127]] · [[PLAN-021]] · [[QA-SETTINGS-017]] · [[SESSION-0094]] · [[TASK-0005]]

<!-- GRAPH:END -->
