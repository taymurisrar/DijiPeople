# Engineering History — Wave 2: Public Plans + Features Experience

| | |
|---|---|
| **Task Title** | Wave 2 — Public Plans + Features Experience |
| **Task Type** | FEATURE (UI/UX + frontend/backend integration) |
| **Date** | 2026-08-16 |
| **Architect Plan** | No separate ExecPlan document. Under `PLANS.md` this is a cross-module feature, so one was warranted; its substance — the evidence-backed feature inventory with classifications, the duplicate-commercial-data audit with dispositions, and the Admin/landing ownership boundary — is recorded in the QA run and BUG-0029 instead. No schema change, no permission change, no migration. |
| **Agents Used** | Architect (feature inventory, data-flow audit), UI/UX (information architecture, copy, icon approach), Frontend (both pages, estimator, comparison), Backend/API (feature catalogue on the commercial config API), QA (scenarios A–G), Reviewer (self-review), Integrator (Git, CI, merge). **Deliberately not used:** Database — no schema change; Release/DevOps — nothing deployed. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/public-commercial-wave2` |
| **Base SHA** | `7686bb0` |
| **Final Task SHA** | `8b2ecb582973b78129d5ed5166167374e0bc73c2` |
| **Target Branch** | `main` |
| **Merge Commit** | `301a397d8c09ee800220e6d84787442c9d7d1915` (PR #14) |
| **Final Target SHA** | `301a397d8c09ee800220e6d84787442c9d7d1915` |

### Commits

```
8b2ecb5 ci: gate on the landing test suite
6c38b94 feat(landing): rebuild Features and Plans on published configuration
```

### Files Changed

31 files.

```
services/api/src/modules/billing/services/commercial-config.service.ts   feature catalogue
services/api/src/modules/billing/public-feature-catalog.spec.ts          (new, REG-019)
apps/landing/app/features/page.tsx                                       rebuilt
apps/landing/app/plans/page.tsx                                          rebuilt
apps/landing/app/plans/plans-experience.tsx                              (new)
apps/landing/app/_components/marketing/feature-icon.tsx                  (new)
apps/landing/lib/{feature-presentation,plan-presentation,subscribe-selection}.ts  (new)
apps/landing/lib/{plan-presentation,subscribe-selection}.spec.ts         (new, 38 assertions)
apps/landing/jest.config.js                                              (new)
apps/landing/app/subscribe/{page,subscribe-form}.tsx                     handoff
apps/landing/app/{layout.tsx,sitemap.ts}                                 origin from config
apps/landing/app/_components/marketing/content.ts                        trimmed to form options
apps/landing/app/_components/marketing/{plans,hero,value,industry}-section.tsx  (deleted)
apps/landing/app/_components/marketing/site-footer.tsx                   (deleted)
.github/workflows/ci.yml                                                 Landing tests job
docs/  (BUG-0029, ITEM-0024, QA run, regressions, dashboards)
```

## Conflicts

None. The branch was cut from `origin/main` at `7686bb0` and `main` did not move
before the merge.

## Conflict Resolutions

None — see above.

## QA

| | |
|---|---|
| **QA Report** | [`docs/qa/runs/2026-08-16-public-commercial-wave2-7686bb0.md`](../../qa/runs/2026-08-16-public-commercial-wave2-7686bb0.md) — **PASS** |
| **Bug IDs** | `BUG-0029` created and closed `FIXED` |
| **Backlog Items** | `ITEM-0024` created (`DEFER`) |

Four findings. The one worth remembering:

- **F2 — a dormant *third* pricing truth in the landing app.** `content.ts` held
  a `plans` array with `monthlyPriceUsd: 200`; `plans-section.tsx` held a
  currency selector with hardcoded FX conversion rates. **Both were
  unreferenced**, so neither was serving wrong prices — but both are the exact
  shape of BUG-0028 and were one import away from being live. Wave 1 fixed the
  pricing truth that was *in use*; this wave found the copies nobody had wired up
  yet. Deleting dead code was the smaller half. The point is that fixing a
  duplicate-source-of-truth defect is not finished until the dormant copies are
  found, because they do not show up in behaviour — only in a search.

## CI

| | |
|---|---|
| **CI Run ID** | `31949387533` (task branch, on `8b2ecb5`) · post-merge run on `301a397` |
| **CI Result** | **PASS** — `CI required gate` succeeded on `8b2ecb5`, the exact SHA merged. The one failing job, `Lint services/api`, is report-only and pre-existing; this wave added one API file and it lints clean. |

**A gate was added mid-wave.** The first commit introduced `apps/landing`'s first
test suite, and nothing in CI ran it — coverage that looks like safety and is
not. `8b2ecb5` adds a `Landing tests` job and includes it in the required gate's
`needs` list, so the suite now blocks a pull request. Verified running and
passing on the final SHA before the merge, rather than assumed.

## Post-Merge Validation

Against the merged SHA `301a397`:

| Command | Result |
|---|---|
| Post-merge CI on `main` | **PASS** — `CI required gate` |
| `node scripts/validate-framework.mjs` | **PASS** — 503 checks |
| `npm run backlog:check` | **PASS** — 53 records, 0 structural errors |
| `npm --workspace landing run test` | **PASS** — 2 suites, 38 tests |
| `public-feature-catalog` + `commercial-offer` specs | **PASS** — 2 suites, 32 tests |
| `npm run test:app-urls` | **PASS** — 16, no BUG-0026 regression |

## Release / Deployment Impact

**Not deployed by this task.** `ROLLBACK_CLASS = CODE_ONLY` — no migration, no
schema change, no contract change for an already-deployed client.

`/features` and `/plans` are now server-rendered rather than static, because both
resolve the visitor's market before rendering. That is deliberate: it is what
removes the currency flicker, and the commercial config endpoint is cached for
60s with `stale-while-revalidate`, so the added per-request cost is a cache read
rather than a database query.

## Knowledge Capture

- `docs/qa/regressions/index.md` — `REG-019`, filed under the existing
  `doc-code-drift` pattern.
- The durable rule, recorded in BUG-0029: **the public site does not own
  commercial or capability truth.** Prices come from published configuration;
  features come from the catalogue the product gates on. What the site
  legitimately owns is the story — which problem each area removes. That
  distinction is what keeps Admin from becoming a CMS and the website from
  becoming a second entitlement database.
- Second lesson, recorded above: a duplicate-source-of-truth fix is not finished
  when the live duplicate is removed.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran against the merged state. The config lives
only in the primary checkout (gitignored); it was copied into the task worktree
for the run and removed afterwards.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/dijipeople-wave2` removed after the merge,
verified clean first. Local branches deleted;
`agent/public-commercial-wave2` retained on the remote, referenced by PR #14 and
fully merged.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0026]] · [[BUG-0028]] · [[BUG-0029]] · [[ITEM-0024]]

<!-- GRAPH:END -->
