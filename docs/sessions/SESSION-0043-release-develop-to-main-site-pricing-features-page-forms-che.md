---
SESSION_ID: SESSION-0043
aliases: [SESSION-0043]
TASK_ID:
TITLE: Release develop to main: site pricing, features page, forms, checkout agreements, admin fixes
ARCHITECT_INTENT: Release develop to main: site pricing, features page, forms, checkout agreements, admin fixes
STATUS: COMPLETE
TASK_TYPE: RELEASE
TASK_SIZE: MEDIUM
BASE_BRANCH: origin/develop
BASE_SHA: 01a88a9fbf19f9901c4c47d45ef27f77dcf78466
TASK_BRANCH: agent/release-site-ux-and-admin
TARGET_BRANCH: main
WORKTREE: D:/My Work/hrm-dijipeople/dijipeople-release
AFFECTED_MODULES: [apps/landing, apps/admin, services/api/src/modules/super-admin]
WRITE_LEASES: []
ACTIVE_WORK_PACKAGES: []
SCHEMA_WRITE: NO
CI_STATUS: PASS
MERGE_STATUS: MERGED
STARTED_AT: 2026-08-22T23:34:11.402Z
LAST_HEARTBEAT: 2026-08-22T23:34:11.402Z
BLOCKERS: none
---

# SESSION-0043 — Release develop to main: site pricing, features page, forms, checkout agreements, admin fixes

## Intent

Release develop to main: site pricing, features page, forms, checkout agreements, admin fixes

## Scope

Promote `develop` (`01a88a9`) to `main`. Twelve commits, no divergence — `main`
holds nothing `develop` lacks, so this is a clean forward release.

**Release class: LOW RISK.** Verified against the delta rather than assumed:

| | |
|---|---|
| Migrations | none |
| `schema.prisma` | unchanged |
| `package-lock.json` | unchanged — no dependency moves |
| `render.yaml` / `turbo.json` / env vars | unchanged |
| `package.json` | two additive scripts only (`repair:market-countries`) |

What ships: the landing site's pricing/theme/copy work, the shared form kit and
single-acceptance agreements step, the admin plan-pricing tab and tenant-list
fixes, two `super-admin` response-mapper fields, the `reconcileMarketsOnly`
repair path, and the records for all of it.

Rollback class: revert the merge commit on `main`. No data migration to unwind.

## Production state found before releasing

Checked rather than assumed, and it is worse than the report that started
SESSION-0042. **Every country resolves to the `GCC` market** — `QA`, `US`, `PK`,
`AE` and `GB` all return `market=GCC, launchStatus=PLANNED,
selfServiceEnabled=false, currency=USD, availableOffers=0`. Pakistan is a
launched market in the catalog and cannot be bought in. Nobody, anywhere, can
buy online right now.

Prices also moved since this morning. At `35f263c` production served QAR 15/25/36
and USD 3.5/5.5/8.5; at `ef57b2a` it serves the catalog's PKR and USD schedules
and **`availableCurrencies` no longer contains QAR at all**. The previous release
(#39) added the `preDeployCommand` that BUG-0767 found missing, so
`npm --workspace api run release` — and therefore `seed:config` and
`bootstrapCommercialDefaults` — ran on production for the first time. It
reconciled prices to `pricing.catalog.ts` and, because the Qatar market has never
successfully existed, left Qatar with no prices in any currency.

This release is the repair for that, not a risk to it: the `ensureMarkets` fix
creates the market before its countries and moves `QA` off `GCC`, after which
`ensurePlanPrices` can finally write the Qatar schedule.

## Concurrency

No write leases. The release adds no code — the only commit on this branch is
this record. `main` is protected with no admin bypass, so integration is by pull
request and the merge waits on an exact-SHA `CI required gate` verdict.

## Concurrency

Write leases held, overlap classification against other active sessions, and
anything this session deliberately serialised behind another. Live state:
`node scripts/session.mjs list`.

## History

- 2026-08-22 — session started from `origin/develop` at `01a88a9`.
- 2026-08-22 — release delta measured: 12 commits, no migrations, no schema or lockfile change.
- 2026-08-22 — production probed before releasing: every country resolves to `GCC`/PLANNED/USD with zero available offers, and QAR has disappeared from `availableCurrencies`.
- 2026-08-23 — `CI required gate` PASS on `9cd2f40` (runs 32605915389 and 32606344362, the pull_request run). A third run passed in 3s with every dependency skipped; that verdict was not used.
- 2026-08-23 — PR #40 merged. `main` = `1dd74a2`, and `develop` fast-forwarded to match, so the two are identical.
- 2026-08-23 — **the deploy did not complete.** Render pre-deploy failed at `legal:publish` with exit 2: all ten legal documents were skipped as `the document declares itself an unpublished draft`. They had been `ALREADY_PUBLISHED` at 22:14 and withdrawn before 00:14 — correctly, since they were unreviewed drafts. The API therefore stayed on `ef57b2a`.
- 2026-08-23 — **the commercial repair landed anyway**, because `seed:config` runs before the failing step and commits: `Country QA was served by market GCC and has been moved to QA`, `1 market(s) created; 12 price(s) created`. Verified live — Qatar resolves to `market=QA`, `LAUNCHED`, `QAR`, six purchasable offers.
- 2026-08-23 — Vercel refused the landing and admin production builds: daily deployment cap, retry in 24h.

## Outcome

`MAIN_SYNC_STATUS = SYNCED`, `MAIN_CHANGE_STATUS = CHANGED` — the one task type
permitted to change `main`, and the reason this session is `RELEASE`.

The release is merged and **partially deployed**, which is the honest reading:

| Surface | State |
|---|---|
| `main` / `develop` | identical at `1dd74a2` |
| Qatar market and pricing | repaired in production, verified live |
| API code | still `ef57b2a` — pre-deploy blocked on `legal:publish` |
| Landing, admin | not deployed — Vercel daily build cap |
| Published legal documents | zero — `/public/legal` returns none |

Two blockers remain, and neither is this task's to decide:

1. **`legal:publish` fails every deploy** until the documents stop declaring
   themselves unreviewed drafts. That guard is correct — it exists because
   drafts once reached production — but its non-zero exit means unrelated API
   code can never ship while legal content is unresolved. Real text, or an
   explicit decision to remove the draft language, is a human call. Filed
   nowhere yet because the decision precedes the record.
2. **Vercel rebuilds `diji-people-landing` and `diji-people-admin` on every push
   to every branch.** `diji-people-web` has an Ignored Build Step and does not.
   `npx turbo-ignore` on the other two is the durable fix; waiting out the
   window or upgrading only buys a day.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this session worked on, cited in its own body:

[[BUG-0767]] · [[SESSION-0042]]

Modules this record declares as affected:

[[landing-architecture]] · [[platform-admin]] · [[super-admin]]

<!-- GRAPH:END -->
