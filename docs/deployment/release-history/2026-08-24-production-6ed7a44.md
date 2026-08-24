# Release — production — `6ed7a44`

> **The first record in this folder, and it is written late.** Eight releases
> reached production before it (`#38` through `#45`) and none was recorded. This
> record documents the **deployed state as verified on 2026-08-24**, not the act
> of deploying — nobody observed those deploys with this template open, and the
> README is right that inventing per-release detail after the fact would put
> fiction in the one place that has to be trustworthy. The unrecorded releases
> are listed below as history that exists in Git and nowhere else, which is the
> gap, not a substitute for it.

| Field | Value |
|---|---|
| **Environment** | production |
| **Date** | 2026-08-24 (verified); merge commit dated 2026-08-24 19:57:47 +0300 |
| **Release SHA** | `6ed7a4402c9ec1e8d9f50f9e7795e98325003298` |
| **Source Branch** | `develop` → `main` via PR #45 |
| **Components** | API (Render `srv-d7js7fqqqhas739v4i7g`); web, admin and landing on Vercel |
| **Migration Status** | **PASS** — `prisma migrate deploy` reports `219 migrations found`, `No pending migrations to apply`. No `P1002`, so the advisory lock was obtainable (bears on [[BUG-0905]]). |
| **Configuration Status** | **PARTIAL** — the `preDeployCommand` chain completed, but two live-service settings are wrong and are tracked separately: [[BUG-0989]] (`STRIPE_WEBHOOK_SECRET` mismatch) and [[BUG-0903]] (`STRIPE_MODE=test`). |
| **Deployment Sequence** | Render `preDeployCommand`: `prisma:migrate:deploy` → `seed:config` → `seed:verify` → `seed:admin` → `repair:market-countries` → `seed:legal` → `legal:publish --confirm`. All steps completed; `legal:publish` reported `ALREADY_PUBLISHED` for all ten documents. |
| **Smoke Test Results** | **PASS** — `scripts/smoke-deployment.mjs` against `https://api.dijipeople.com/api`, 2026-08-24. See below. |
| **Monitoring/Health Results** | `/api/health` returns `status: ok`, `environment: production`, `commit: 6ed7a4402c9ec1e8d9f50f9e7795e98325003298`. The served commit equals `origin/main`, so the merge did deploy — the failure mode in [[merging-main-does-not-guarantee-deploy]] is not present. |
| **Incidents** | None during this release. One standing production defect predates it and is unresolved: [[BUG-0989]]. |
| **Rollback Classification** | NOT_REQUIRED — no rollback was performed or needed. |
| **Rollback Result** | NOT_APPLICABLE — no rollback occurred. |
| **QA Report** | [`2026-08-24-record-state-reconciliation-0a5586f.md`](../../qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md) — verifies deployed state, not the deploy itself. |
| **Backlog/Bug References** | Verified resolved in production: [[BUG-0899]], [[BUG-0906]], [[BUG-0907]]. Confirmed still live: [[BUG-0989]], [[BUG-0903]], [[BUG-0898]]. |
| **Engineering History** | [[TASK-0011]] WP-02, [[TASK-0007]] WP-15. |
| **Final Verdict** | **PASS with a named exception.** The platform is deployed, healthy, migrated and serving. Self-service purchase does not work end to end, for configuration reasons recorded as [[BUG-0989]] and [[BUG-0903]]. |

## Smoke test output

`SMOKE_API_BASE_URL=https://api.dijipeople.com/api SMOKE_ORIGIN=https://app.dijipeople.com node scripts/smoke-deployment.mjs`

```
ok - API health endpoint
    commit: 6ed7a44
ok - API reports the commit it is serving
ok - protected profile rejects unauthenticated request
Skipping authenticated smoke checks. Set SMOKE_LOGIN_EMAIL and SMOKE_LOGIN_PASSWORD.
ok - CORS origin is accepted
ok - a launched market has at least one purchasable plan
ok - legal documents are published
Deployment smoke checks completed successfully.
```

The authenticated checks were skipped: they need
`SMOKE_LOGIN_EMAIL` / `SMOKE_LOGIN_PASSWORD`, which are production credentials
this run deliberately did not hold. Recorded as skipped rather than passed.

Note what "a launched market has at least one purchasable plan" does and does
not prove. It passes because two `starter` prices are Stripe-synced and
`checkoutReady`. It says nothing about the other 34, nor about `growth`,
`enterprise` or `enterprise-plus`, none of which can be bought — [[BUG-0898]].
The check is a floor, not a coverage statement.

## Additional verification

| Check | Result |
|---|---|
| `GET /api/public/legal` | 10 documents, all version 1, published 2026-08-23T21:23Z |
| `GET https://www.dijipeople.com/legal/privacy` | `200` |
| `GET https://www.dijipeople.com/legal/not-a-real-document` | `404` — [[BUG-0907]] is fixed in production |
| Landing footer | links all ten legal documents |
| Commercial catalogue | 36 active prices; matches `pricing.catalog.ts` exactly — 0 to create, 0 to retire, 0 to supersede |
| `POST /api/billing/stripe/webhook` | `400 VALIDATION_FAILED` — `"Invalid Stripe webhook signature."` — [[BUG-0989]] |

## Releases that reached production without a record

From Git first-parent history on `main`. Listed so the gap is visible rather
than silently closed by this record:

| PR | Commit | Subject |
|---|---|---|
| #45 | `6ed7a440` | Merge pull request #45 from taymurisrar/develop |
| #44 | `7d91c8a0` | Release: the visitor's country, not the datacenter's |
| #43 | `f4ee94cd` | Release: currency follows the visitor, and flat pricing stays internal |
| #42 | `6b315835` | Release: real legal copy that unblocks deployment, a plan-entitlement data-loss fix, and the plan pricing screen rebuilt |
| #41 | `be486ae1` | Release: the three checkout fixes, a soft-404 fix, and the tests the public site never had |
| #40 | `1dd74a25` | Release: regional pricing, features page, forms, checkout agreements, and admin plan/tenant fixes |
| #39 | `ef57b2a6` | Release: the draft-publication guard, so the new preDeployCommand is safe |
| #38 | `35f263c6` | Release: publish legal documents and apply the corrected production URLs |

`ef57b2a6` (#39) is the commit production was **stuck on** for a day while
[[BUG-0899]] blocked every subsequent deploy. That it is now four releases behind
the served commit is the evidence that BUG-0899 is resolved.

Only `6ed7a44` is documented above, because only `6ed7a44` was observed. The
missing seven are a real gap in this folder and the reason
[`ITEM-0084`](../../backlog/items/ITEM-0084-detect-drift-between-render-yaml-and-the-live-render-service.md)
and a release-record step in the promotion path both matter.
