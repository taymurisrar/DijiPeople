# Engineering History — Site ux and admin fixes

| | |
|---|---|
| **Task Title** | Site ux and admin fixes |
| **Task Type** | BUGFIX + REFACTOR — five defects fixed, plus a UI/UX and copy pass across the public site |
| **Date** | 2026-08-22 |
| **Architect Plan** | NOT_APPLICABLE — no change class in [`PLANS.md`](../../../PLANS.md) applies. No schema change, no migration, no auth or permission change, no new module. The largest single change is a page rebuild inside one app. |
| **Agents Used** | Architect (routing, triage, disposition), Backend/API (commercial bootstrap, super-admin mappers), Frontend (landing pages, admin runtime), UI/UX (theme unification, features page, forms, agreements), Integration (currency resolution across three surfaces), QA (scenarios and regressions), Reviewer (self-review against the Security checklist), Integrator (branch, merge, push). Not used: Database — no schema or migration change; Security — no auth, permission, tenant-scoping or secret surface touched, and the public endpoints involved were read-only and already rate-limited; Release/DevOps — this targets `develop` and deploys nothing. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/site-ux-and-admin-fixes` |
| **Base SHA** | `ef57b2a6ba06c5eacf9ba7898b862edf8308a91b` |
| **Final Task SHA** | `00ef62c344a26ef0ebabb3e144b6033e3c2bbb86` |
| **Target Branch** | `develop` — corrected from the script's derived value. This is an ordinary task, so `main` stays untouched (`MAIN_CHANGE_STATUS = UNTOUCHED`, baseline `35f263c`). |
| **Merge Commit** | None — integrated by ref-push, `git push origin agent/site-ux-and-admin-fixes:develop`, so `develop` fast-forwards to the exact SHA CI verified. No merge commit exists, and that is the point: a merge commit is a SHA no CI run has seen. |
| **Final Target SHA** | `00ef62c344a26ef0ebabb3e144b6033e3c2bbb86` — identical to the final task SHA. |

### Commits

```
5465697 fix(commerce): one currency across the site, and a Qatar market that resolves
cbc65c5 fix(admin): restore plan price configuration and make the tenant list current
27e218f refactor(landing): one form kit, and one acceptance instead of ten
8c56006 refactor(landing): one visual system across the public site, and copy a buyer can read
eb7db31 docs(backlog): five bug records, five regressions and five QA scenarios for this task
66b864c Merge origin/develop into agent/site-ux-and-admin-fixes
bd46686 docs(session): record scope, concurrency and the REG-229 collision for SESSION-0042
00ef62c fix(commerce): a market repair that cannot halve production's prices
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            ef57b2a [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75 [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532 [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacd [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab11 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f0 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625 [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661 [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8 [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-qa                         ef57b2a [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622e [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa738 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-site-ux                    66b864c [agent/site-ux-and-admin-fixes]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b [agent/plans-reset]
```

### Files Changed

59 file(s) against `origin/main`.

```
M	apps/admin/app/_components/runtime/runtime-module-list.tsx
M	apps/admin/app/_components/runtime/runtime-record-page.tsx
A	apps/admin/lib/runtime/column-preferences.spec.ts
M	apps/admin/lib/runtime/platform-module-registry.ts
A	apps/admin/lib/runtime/runtime-record-panels.spec.ts
A	apps/landing/app/_components/forms/form-kit.tsx
M	apps/landing/app/_components/marketing/lead-form-section.tsx
A	apps/landing/app/_components/marketing/typography.tsx
D	apps/landing/app/_components/plan-cards.tsx
A	apps/landing/app/_components/plan-preview.tsx
M	apps/landing/app/_components/site-shell.tsx
M	apps/landing/app/about/page.tsx
M	apps/landing/app/contact/contact-form.tsx
M	apps/landing/app/contact/page.tsx
M	apps/landing/app/features/page.tsx
M	apps/landing/app/layout.tsx
M	apps/landing/app/page.tsx
M	apps/landing/app/partners/activate/[token]/activation-form.tsx
M	apps/landing/app/partners/onboarding/[token]/partner-onboarding-form.tsx
M	apps/landing/app/partners/page.tsx
M	apps/landing/app/partners/partner-inquiry-form.tsx
M	apps/landing/app/plans/page.tsx
M	apps/landing/app/request-demo/page.tsx
M	apps/landing/app/subscribe/onboarding-steps.tsx
M	apps/landing/app/subscribe/page.tsx
M	apps/landing/app/subscribe/subscribe-form.tsx
M	apps/landing/lib/legal-server.ts
M	apps/landing/lib/subscribe-selection.spec.ts
M	apps/landing/lib/subscribe-selection.ts
M	docs/backlog/index.md
M	docs/backlog/open.md
A	docs/bugs/BUG-0792-qatar-market-resolves-to-gcc-because-its-country-row-is-neve.md
A	docs/bugs/BUG-0793-checkout-quotes-the-alphabetically-first-plan-price-currency.md
A	docs/bugs/BUG-0794-plan-record-page-pricing-tab-is-filtered-out-leaving-plan-pr.md
A	docs/bugs/BUG-0795-saved-table-preferences-hide-every-column-added-to-a-module-.md
A	docs/bugs/BUG-0796-tenant-and-plan-list-summaries-omit-createdbyid-so-the-creat.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-BILLING-015-market-country-claims-converge-on-the-catalog-so-a-launched-.md
A	docs/qa/scenarios/QA-LANDING-015-checkout-quotes-the-visitor-market-currency-not-the-first-pr.md
A	docs/qa/scenarios/QA-PLATFORM-020-a-personal-list-view-filters-on-a-field-the-list-payload-ret.md
A	docs/qa/scenarios/QA-RUNTIME-015-every-runtime-record-panel-is-mounted-on-a-tab-an-operator-c.md
A	docs/qa/scenarios/QA-RUNTIME-016-a-column-added-to-a-module-reaches-operators-who-saved-table.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-011-runtime-modules.md
M	docs/qa/test-plans/PLAN-013-landing.md
M	docs/qa/test-plans/PLAN-019-platform-admin.md
M	docs/qa/test-plans/PLAN-020-billing.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0042-public-site-pricing-features-page-forms-checkout-agreements-.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	services/api/src/modules/super-admin/commercial-bootstrap.reconcile.spec.ts
M	services/api/src/modules/super-admin/commercial-bootstrap.ts
M	services/api/src/modules/super-admin/super-admin.service.ts
```

## Conflicts

Six files conflicted merging `origin/develop` (`ef57b2a`) into the task branch.
Five were the same type; the sixth was not, and it is the only one worth reading
about.

**Generated-artifact conflicts** — `docs/backlog/index.md`,
`docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md`,
`docs/qa/coverage-matrix.md`, `docs/qa/scenarios/index.md`,
`docs/qa/test-plans/index.md`. Both sides added records and both regenerated the
indexes, so the generators wrote overlapping lines. Neither side "intended"
anything about these files: they are outputs.

**Durable-id collision** — `docs/qa/regressions/index.md`. The regression
register is hand-maintained and has no allocator. Develop had claimed `REG-229`
for the legal draft-publication guard (BUG-0767); this branch had claimed the
same id for the market country reconciliation (BUG-0792). Both sides appended
"the next id" against the same base, and neither could see the other. This is the
same class of failure `scripts/allocate-id.mjs` exists to prevent for bug and
item ids, and the register is the one durable-id space it does not cover.

## Conflict Resolutions

**Generated artifacts** — took develop's copy, then re-ran
`rebuild-backlog.mjs`, `rebuild-qa.mjs` and `generate-dashboards.mjs`. Choosing
either side by hand would have produced a file that agrees with neither branch's
records; regenerating is the only resolution that can be right, and
`validate:framework` is what proves it (3538 checks, passing).

**REG-229** — develop's entry keeps the id; this branch's five renumbered to
`REG-230`–`REG-234`.

Develop's claim is the older one and is already merged, so renumbering it would
rewrite an id that other records and a future reader's memory already point at.
Renumbering ours costs five records' `RegressionId`, five QA scenarios'
`RELATED_REGRESSIONS` and five remediation-inventory rows — all unpublished, all
on this branch.

The instructive part is what the renumber nearly took with it. A blanket
find-and-replace across `docs/` also caught `QA-LEGAL-001`, which is develop's
scenario pointing at develop's `REG-229` — rewriting it to `REG-230` would have
silently repointed their record at our regression, and every validator would have
passed, because both ids exist and both resolve. It was restored from
`origin/develop` and the inventory row for `BUG-0767` was put back to `REG-229`
by hand; `validate:framework` caught that second one as
`BUG-0767.regressions` drift, which is the check earning its keep.

## QA

| | |
|---|---|
| **QA Report** | No `docs/qa/runs/` entry — no QA run was executed. Every finding here came from reading production responses and source, and each is covered by an automated regression instead. The five scenarios below are durable and reusable; their live-site steps are marked pending. |
| **Bug IDs** | Created and fixed: `BUG-0792`, `BUG-0793`, `BUG-0794`, `BUG-0795`, `BUG-0796`. All five `FIXED` with `ArchitectDisposition: FIX_NOW`. None left `TRIAGE_REQUIRED`. |
| **Backlog Items** | None created, advanced or closed. |

## CI

| | |
|---|---|
| **CI Run ID** | `32603250502` |
| **CI Result** | PASS, read on `00ef62c` — the exact SHA integrated. Two earlier runs on this branch were cancelled as `SUPERSEDED` (`eb7db31`, `bd46686`) because a later commit was pushed while they were in flight; `await-ci` classified both correctly rather than reporting a failure. A superseded run is not evidence about anything, and neither was used. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

Run against the merged SHA `00ef62c`. `develop` fast-forwards to exactly this
commit, so the integrated tree and the validated tree are the same object rather
than two things that ought to match:

| Command | Result |
|---|---|
| `npm run typecheck` | PASS — 8/8 workspaces |
| `npm run lint` | PASS — 0 errors, 800 pre-existing warnings, none in a changed file |
| `npm --workspace api run test` | PASS — 211 suites, 1678 tests |
| `npm --workspace admin run test` | PASS — 28 suites, 228 tests |
| `npm --workspace web run test` | PASS — 22 suites, 438 tests |
| `npm --workspace landing run test` | PASS — 10 suites, 141 tests |
| `npm run validate:framework` | PASS — 3538 checks |
| `npm run backlog:check` | PASS — 215 records, 0 structural errors |
| `npm run qa:check` | PASS — 21 plans, 172 scenarios |
| `npm run sessions:check` / `npm run tasks:check` | PASS |

Not run, and why: `npm run build` — no build inputs changed (no config, no
dependency, no `next.config.ts`), and typecheck plus lint cover the changed
files; CI builds every app on the gate regardless. `npm --workspace api run
test:e2e` and `npm run db:preflight` — no schema, migration or query change; the
two API edits add already-selected scalar fields to response mappers. No local
database was available and none was needed.

Two new specs were **mutation-tested** rather than merely run green: restoring
`if (existing) continue;` in `ensureMarkets` fails two cases in
`commercial-bootstrap.reconcile.spec.ts`, and restoring the single-tab allowance
fails two cases in `runtime-record-panels.spec.ts`. A test that passes both with
and without the fix is not regression coverage.

## Release / Deployment Impact

None — not deployed. This integrates into `develop`; `main` is untouched.

**One outstanding production action, which is the owner's to take.** The
`BUG-0792` code fix stops the state recurring; it does not clear the state
already in production. That needs `npm run repair:market-countries` run once
against the production database.

The first draft of this record said `npm run seed:commercial`, which is the
obvious answer and was the wrong one. That entry point also reconciles plan
prices against `pricing.catalog.ts`, and the two disagree on this database: the
catalog has Qatar per-seat monthly at QAR 8 / 14 / 22 and International at USD
2.2 / 3.85 / 6.05, while production is selling QAR 15 / 25 / 36 and USD 3.5 /
5.5 / 8.5. Repairing a join table that way would have superseded every live
price, roughly halving them — nothing already sold, since `reconcilePlanPrice`
supersedes rather than edits, but the next customer would be charged a number
nobody decided on today. `reconcileMarketsOnly` was added so the repair cannot
reach a price, with three tests holding that line.

Which schedule is authoritative — the catalog, or what production is selling — is
a genuine commercial question that nothing in this repository answers. It is
left open deliberately rather than resolved by whichever code happened to run.

**A visible consequence until the repair runs.** `/` and `/plans` now show
"Pricing on request" in Qatar rather than a USD price. That follows from the
BUG-0793 fix: the home page reads the same market-scoped source as `/plans`
instead of quoting an unscoped price, so it shows what the market can actually
sell. An honest absence beats a wrong number, but it is a change the owner will
see, and the repair is what removes it.

## Knowledge Capture

No new `docs/knowledge/` file. What was learned is recorded where it will
actually be retrieved — in the regression register, which
`retrieve-knowledge.mjs` surfaces per module:

- **REG-230** — a unique violation means "somebody else holds this", which is
  only benign when the holder is who you wanted. `ensureMarkets` caught one and
  assumed the second half.
- **REG-231** — a per-currency price list ordered by currency makes `prices[0]`
  a decision nobody made. A single-currency fixture cannot fail that way, which
  is why nine existing cases passed throughout.
- **REG-232** — a UI panel guarded on a tab the tab bar filters out is
  unreachable code that compiles, lints and tests clean. Deriving reachability
  from the source is what makes the next instance fail in CI.
- **REG-233** — a saved user preference reapplied verbatim silently freezes a
  screen at the version it was saved against, for exactly the people who use it
  most.
- **REG-234** — a list view filtering on a field the list payload omits is a
  control that looks functional and selects nothing.

Two of these — REG-232 and REG-234 — are second instances of patterns already
described in a comment beside the code that repeated them. Naming a class of
defect in prose did not prevent it; a check that resolves the relationship did.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran after integration: 109 notes written, 559
already current, 6 skipped as empty by the no-evidence policy.
`knowledge:verify` then read the vault back — `OBSIDIAN_SYNC_STATUS = PASS`,
668 generated notes, 0 orphans, 0 stale nodes, 0 parity diffs, 0 unresolved
wikilinks.

Changed folders: `Generated/Bugs` (BUG-0792 to BUG-0796), `Generated/QA`
(the five scenarios and the plans they belong to), `Generated/Sessions`
(SESSION-0042), `Generated/History` (this record) and the dashboards.

## Cleanup

Task worktree `D:/My Work/hrm-dijipeople/dijipeople-site-ux` removed after this
record was pushed, and the junctioned `node_modules` links with it.

The remote branch `agent/site-ux-and-admin-fixes` is retained: it is the branch
whose exact SHA carries the `CI required gate` verdict that authorised the
integration, and deleting it would leave that verdict addressable only by SHA.

The primary checkout `D:/My Work/hrm-dijipeople/DijiPeople` was clean at the
start of this task and is clean at the end — `PRIMARY_WORKTREE_STATUS = CLEAN`,
`UNEXPLAINED_DIRTY_FILES = 0`. The session record was written there by
`session.mjs start` and moved into the task worktree before any other work, which
is the only reason that holds.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0767]] · [[BUG-0792]] · [[BUG-0793]] · [[BUG-0794]] · [[BUG-0795]] · [[BUG-0796]] · [[PLAN-011]] · [[PLAN-013]] · [[PLAN-019]] · [[PLAN-020]] · [[QA-BILLING-015]] · [[QA-LANDING-015]] · [[QA-LEGAL-001]] · [[QA-PLATFORM-020]] · [[QA-RUNTIME-015]] · [[QA-RUNTIME-016]] · [[SESSION-0042]] · [[TASK-0005]]

<!-- GRAPH:END -->
