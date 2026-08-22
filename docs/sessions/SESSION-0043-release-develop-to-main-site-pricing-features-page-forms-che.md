---
SESSION_ID: SESSION-0043
aliases: [SESSION-0043]
TASK_ID:
TITLE: Release develop to main: site pricing, features page, forms, checkout agreements, admin fixes
ARCHITECT_INTENT: Release develop to main: site pricing, features page, forms, checkout agreements, admin fixes
STATUS: ACTIVE
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
CI_STATUS: NOT_RUN
MERGE_STATUS: NOT_STARTED
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
