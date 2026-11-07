# Integrated release validation — corrective release candidate (2026-11-07)

Separate from RUN-008, which stays immutable. RUN-008 verified `4dd29d3a`; this record validates the
**integrated** candidate (production `2a473785` + the 60-commit remediation + DP-QA-051/052 work).
RUN-008's verdict is not approval for the modified code. Sanitized: no credentials, connection strings,
MFA material, tokens or raw production logs. Originals are kept in a private local evidence folder.

## Candidate
| Item | Value |
|---|---|
| Branch / PR | `agent/starter-remediation-integration` → `develop`, PR #135 |
| Candidate head | `c68f98ab` (only change after the CI-green `9d71d2b3` is a smoke-script comment/doc line) |
| CI on `9d71d2b3` | 33 jobs SUCCESS, 1 SKIPPED, merge state CLEAN |
| Production baseline | `2a473785` (PRs #124–#127, existing migration and dependency upgrades preserved) |
| Develop/main reconciliation | PR #134 merged (DEVELOP_CONTAINS_MAIN restored) |

## What was added on top of the remediation
- **DP-QA-052:** the DB setting stays authoritative; the Render variable is only a floor and never weakens it.
  `/api/health` reports mode, stored value, floor and source; a floor stricter than the stored value logs
  `ENTITLEMENT_SETTING_DRIFT`, and nothing enforcing logs `ENTITLEMENT_NOT_ENFORCED`. Every change to the
  setting (admin API or the set-mode script) writes an audit row with actor, timestamp and previous/new value.
  The release gate refuses a non-enforcing deploy.
- **DP-QA-051:** tenant-aware smoke (`scripts/smoke-deployment.mjs`): separate platform-admin and tenant sign-in,
  Starter journey (login, session, employees, leave, attendance, documents, plan restrictions, logout and
  post-logout rejection). `SMOKE_REQUIRE_STARTER_PROBE=1` fails if no synthetic account is configured. No
  credential, challenge or token is ever printed.
- **Regression tests** for each behaviour that production lacked (see spec 34 below and the API specs
  `tenant-entitlement-drift`, `entitlement-setting-audit`).
- **Tested rollback:** `docs/deployment/corrective-release-2026-11-04-rollback.sql` (transactional, idempotent).

## Migration rehearsal (restored production backup, isolated throwaway databases)
- Two pending migrations: `20261101090000_split_data_import_export_entitlement`,
  `20261102090000_plan_kind_and_custom_plan_metadata`. Both are earlier-dated than the applied
  `20261103090000_…`; `migrate deploy` applies them in any order. Production ledger and files were inspected;
  nothing was edited, reset or marked applied by hand.
- Full sequence (migrate → seed:config twice) passed on a fresh production copy. Plan ids, legacy Custom plans,
  prices, subscriptions, invoices, payments and entitlements were preserved (row-count and key diff).
  Legacy `enterprise-plus` is converted in place to a `CUSTOM_ONLY` plan, not deleted.
- Idempotent on second application. Rollback SQL returned a rehearsed database to the pre-release
  plan/feature state (matched production after fixing a missed Growth `desktop-agent` row).
- Seed memory: `seed:config` peaks ≈3.66 GB RSS under ts-node — identical for production code and the
  integrated code — against a 4 GB pre-deploy heap. Not a regression, but a thin margin; watch the first deploy.
- Fresh backup taken before the rehearsal (checksum recorded privately); a **new backup is still required
  immediately before the production migration.**

## Integrated QA regression (RUN-008-equivalent Starter scenarios + new INT checks)
Executed on a local isolated stack built from the integrated candidate, including legacy-database migration runs.

| Project | Result |
|---|---|
| chromium (full) | all pass except CUS-030 (DP-QA-045); 20 skip |
| firefox / webkit / mobile / tablet | pass (20 / 27 / 23 / 23 passes; 7 declared skips on firefox) |
| legacy-a/b/c (legacy-data migration variants) | 8 each, pass |
| **Total (latest attempt wins)** | **580 pass / 1 fail / 27 skip of 608** |

- Only failure: **CUS-030** — an expired Custom subscription's treatment. That is **DP-QA-045** and needs an owner decision (below).
- Attempt history is kept for ten tests that changed result between attempts. All were environmental or
  fixture issues, not product faults: INT-004 (smoke account needed an employee link — fixture), INT-005 and CUS-031/032 (first attempt skipped, later attempt passed on a fresh stack), INT-006 (an employee role is correctly refused `/tenant-settings/features`; expectation corrected, no product assertion weakened), SEC-003/004 (20-per-10-minute login limiter inside a batch; pass in isolation), mobile/tablet SMK-003/014 (`ERR_NETWORK_CHANGED`; rerun passed).
- Skips (27) are declared and carried from earlier runs (browser/engine specific or owner-decision gated); none were added to hide a failure.
- **Not run / not possible locally:** live Stripe/Safepay payment, real SMTP delivery, production-hosted browser matrix.
  These need the production smoke with approved identities.

## Other gates
- API unit + PostgreSQL integration (Database e2e), governance gates, typecheck, lint (prettier), builds, secret scan — **green on CI for `9d71d2b3`.**
- `CI-007` fails locally on Windows (CRLF) and on production main in the same checkout; it passes on Linux CI. Not a defect.
- Secret scan of the QA suite and tools: 148 files, 0 findings.

## Mail and billing readiness (DP-QA-053, P3)
- Production ignores CONSOLE/DEV tenant provider rows and uses the platform relay (ADR-0015 / BUG-3501); the
  original premise of DP-QA-053 was wrong and has been corrected. Seeding and migration do not touch real providers.
- One controlled delivery to an owner-approved mailbox is **pending owner approval** — email notifications are
  **not** represented as operationally verified. Stripe stays TEST, Safepay SANDBOX; paid onboarding is not operational.

## Owner decisions (do not block a Starter-only corrective security release)
- **DP-QA-045** — proposed policy: an EXPIRED Custom subscription loses the Custom plan's operational entitlements
  after a documented grace period, the tenant keeps read/export access, and renewal reinstates. Needs a commercial
  decision on grace length. No security or contractual exposure for Starter tenants.
- **DP-QA-046** — proposed policy: Custom-plan price changes apply to new subscriptions only; existing
  subscriptions keep their price until renewal with notice. Needs commercial sign-off.

## Verdict for this candidate
Ready for the release gate sequence: merge #135 → develop; release PR develop → main with exact-SHA CI; fresh
backup; apply the two migrations via the direct connection; deploy; verify exact SHAs, `ENFORCE`, 239 migrations,
and the authenticated synthetic-Starter smoke (needs the dedicated account — owner approval).
