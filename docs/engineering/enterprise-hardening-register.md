# Enterprise hardening — implementation register

> Single register for the program that began with SESSION-0135 and continues in
> SESSION-0137. Updated in place; do not fork a second report. Evidence for the
> earlier performance and reliability work lives in
> [`docs/engineering/audits/2026-11-21-reliability-cost-audit/00-REPORT.md`](audits/2026-11-21-reliability-cost-audit/00-REPORT.md).
>
> **Last updated:** 2026-11-21, session SESSION-0137, branch `agent/dependency-alert-remediation`.
> Every figure below was measured on that date from the GitHub Dependabot API
> and the lockfiles at `origin/develop` (`0bc738c8`) unless stated otherwise.

## 1. Dependency alert inventory (WP1)

GitHub reported 111 open alerts against the default branch (`main`). They are
scored against `main`'s lockfile, so they stay open until a release carries the
fix to `main`; `develop` and `main` carried the same vulnerable versions
for every package below.

| Severity | Development scope | Runtime scope |
|---|---|---|
| critical | 2 | 0 |
| high | 35 | 4 |
| medium | 50 | 1 |
| low | 19 | 0 |

**The two criticals** are both `handlebars@4.7.9` (GHSA-p8wg-vrv2-v86f,
GHSA-8r5x-fm3f-whwj), a transitive dev tool. Fixed by 4.7.10.

**The four runtime highs** are all `xlsx@0.18.5`, with no fixed version on npm,
for GHSA-4r6h-8v6p-xvw6 (prototype pollution) and GHSA-5pgg-2g8v-p4x9 (ReDoS).
Both are triggered by *parsing* a crafted workbook.

### Disposition of each package with a critical or high alert

| Package | Alerts | Disposition | Evidence |
|---|---|---|---|
| `handlebars` | 2 critical | **Fixed** → 4.7.10 | lockfile diff, `npm audit` critical 2 → 0 |
| `undici` | 3 high | **Fixed** → 6.29.1 | lockfile diff |
| `js-yaml` (3.x) | 2 high | **Fixed** → 3.15.2 | lockfile diff |
| `browserslist` | 1 high | **Fixed** → 4.29.6 | lockfile diff |
| `electron` (39.x track) | 24 high/medium/low | **Fixed** → 39.8.10 | lockfile diff |
| `electron` (41/42-only: alerts 96, 98, 100, 102, 152) | 5 + lockfile twins | **Tracked**, not applicable by call site except 152 | [[ITEM-0234]] |
| `extract-zip` | 2 high, no fix on npm | **Tracked**; leaves the tree with Electron 42 | [[ITEM-0234]] |
| `xlsx` | 4 high (2 advisories × manifest + lockfile) | **Proven not reachable; guarded by a test** | see below, [[ITEM-0070]] |
| `mysql2` | 1 high | **Existing documented disposition holds** | pinned exactly by `prisma@7.10.0`; datasource is PostgreSQL only; `check-production-advisories.mjs` |

### `xlsx` — why "not reachable" is now enforced rather than asserted

Parsing moved to ExcelJS earlier (`ExcelExportService.parseFirstWorksheet`,
`import-analysis.service.ts`). SheetJS is used only to *write*
(`buildWorkbookBuffer`). A registry sentence is not enforcement, so
`services/api/src/common/excel/xlsx-write-only.invariant.spec.ts` fails if any
source file calls a SheetJS read or parse function, imports one by name, or if
anything other than the export service imports `xlsx`. Mutation-tested on
2026-11-21: three violating files were each caught, and a read call that appears
only in a comment was correctly not flagged.

Removing the dependency entirely needs the bank payroll writer ported to
ExcelJS, which changes the bytes of workbooks sent to banks. That decision was
deferred earlier as [[ITEM-0070]] and is unchanged.

## 2. Work packages

| WP | Scope | Status | Evidence |
|---|---|---|---|
| WP1 | Dependency alerts: fix what has a safe in-range fix, prove or track the rest | **Implemented; CI pending on the exact final SHA** | commit `f19b247d` plus the follow-up commit on the same branch |
| WP2 | Electron 42 upgrade + sandbox | **Not started — tracked** | [[ITEM-0234]], [[ITEM-0235]]; needs a real Windows device |
| WP3 | Tenant-isolation penetration tests, auth/MFA/session review | Not started | |
| WP4 | Render `render.yaml` drift (39 fields), Neon polling/scan investigation, network-transfer spike | Not started | `npm run check:render-config` reports 39 differing fields |
| WP5 | Vercel Node 22/24 drift, selective builds, frontend performance | Not started | |
| WP6 | Agent-workforce efficiency | Not started | |
| WP7 | Observability, runbooks, restore drills | Not started | |
| WP8 | Compliance control register (HIPAA applicability, ISO, SOC 2, ASVS, NIST) | Not started | |

## 3. Measured results so far

| Measure | Before | After | How |
|---|---|---|---|
| Critical advisories (all scopes, local lockfile) | 2 | 0 | `npm audit` |
| `npm audit` high (all scopes) | 39 on GitHub's count | 9 | `npm audit` after the upgrades |
| Production advisory gate | passing | passing, 0 critical, 13 dispositioned | `scripts/check-production-advisories.mjs` |
| Lockfile entries changed | — | 10 | version diff against `origin/develop` |

GitHub's open-alert count will not change until the fix reaches `main`.

## 4. Decisions needed from the owner

| # | Decision | Recommendation |
|---|---|---|
| 1 | Dismiss the four `xlsx` runtime alerts on GitHub as "vulnerable code is not used"? It is a visible state change on the repository, so it is not done here. | Yes, after [[ITEM-0070]] or once this change reaches `main`, citing the invariant test. |
| 2 | Take Electron to 42.x ([[ITEM-0234]]) in the next desktop agent release? | Yes, with the real-device checklist. |

Carried over from SESSION-0136: QUESTION-3931 (shared geography writes),
`relationJoins` (D7), Vercel dashboard wiring (D4), BUG-3136 rate-limit budgets,
tenant enumeration on `public/tenants/resolve`.

## 5. Restartable handoff

- Branch `agent/dependency-alert-remediation` is pushed; its worktree is
  `D:/My Work/hrm-dijipeople/dijipeople-perf-reliability`.
- WP1 is integrated into `develop` only after `CI required gate` is green on the
  exact final SHA and `develop` has not moved.
- Next in order: WP3, then WP4. Nothing in WP2–WP8 has started.
- Not touched and not to be touched: `main`, production, the primary checkout's
  two pre-existing files, other sessions' worktrees.
