# QA Run — record-state-reconciliation

## Metadata

| | |
|---|---|
| Date / time | 2026-08-24T17:25:00.339Z |
| Branch | `agent/record-state-reconciliation` |
| Commit SHA | `0a5586f7902c5775dc0419ea0d672ff09c910d1c` |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-recon` |
| Environment | Working tree dirty only with this run's own record edits. No local database — every suite below is a unit suite that needs none; `DATABASE_URL` was set to an unreachable dummy so the specs that read it at import time load. External services: production `api.dijipeople.com` and `www.dijipeople.com` were probed read-only. |
| QA agent | QA |
| Scope | Retest of the sixteen bug records sitting at `Status: FIXED` with a named regression test and an empty `QAReport`. **In scope:** does the named regression test exist, and does it pass at this commit. **Not in scope:** the records whose regression test is a Playwright e2e spec needing a full running stack — they are verified by other means or left `FIXED`, and each is called out below. |

## Requirement

Sixteen bug records carried `Status: FIXED`, a populated `RegressionId`, and an
empty `QAReport`. Under [`docs/bugs/README.md`](../../bugs/README.md) a record
may not reach `VERIFIED` without a QA retest, so all sixteen were stalled behind
a step nobody had run — not behind any missing engineering. This run supplies
that step, or states why it cannot for a given record.

The question this run answers is deliberately narrow: **is the fix present and
does its regression test pass at `0a5586f`?** It is not a re-review of whether
each fix was the right one; the Reviewer already passed each at merge time.

## Risk Areas

The failure mode this run exists to prevent is a **record marked `VERIFIED` on
the strength of its own claim**. That is [[ITEM-0071]] — "a record may not claim
a fix it cannot describe" — and it was raised against this repository before.
Every row in Scenarios below therefore names executed output, not a resolution
paragraph.

The second risk is a regression test that passes whether or not the fix is
present. This run does **not** stash-and-rerun each of the sixteen, and that
limitation is stated plainly in Known Limitations rather than papered over.

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Every regression test named by REG-226..REG-242 exists on disk | contract | 17/17 present | PASS | file existence check, all `OK` |
| S2 | The nine API regression suites pass | regression | 9 suites green | PASS | `9 passed, 58 tests, 38.5s` |
| S3 | The six admin runtime regression suites pass | regression | 6 suites green | PASS | `6 passed, 57 tests, 6.6s` |
| S4 | The landing checkout-selection regression suite passes | regression | 1 suite green | PASS | `1 passed, 19 tests, 0.7s` |
| S5 | BUG-0907 — an unknown legal slug returns 404 in production | negative | `404` | PASS | `GET www.dijipeople.com/legal/not-a-real-document` returns `404`; `/legal/privacy` returns `200` |
| S6 | BUG-0902 — `markTenantReady` has a caller | contract | at least one call site | PASS | `provisioning-requested.handler.ts:223` |
| S7 | BUG-0163 — CI proves the lockfile regenerates | contract | step present in the gate | PASS | `.github/workflows/ci.yml:141` "Lockfile regenerates from the manifests" |
| S8 | BUG-0899 — production deploys past `legal:publish` | regression | deploy completes | PASS | production `/api/health` reports `6ed7a44` = `origin/main`; deploy log shows `legal:publish` returning `ALREADY_PUBLISHED` |
| S9 | BUG-0906 — production serves published legal documents | happy | non-empty document list | PASS | `GET /api/public/legal` returns Privacy Policy and Terms of Service, both `version 1`, published `2026-08-23T21:23Z` |
| S10 | BUG-0989 — Stripe webhook deliveries succeed | negative | signature verification reached and passing | **FAIL** | 11 log lines `POST /api/billing/stripe/webhook` returning `400 VALIDATION_FAILED`; probe returns `"Invalid Stripe webhook signature."` |
| S11 | BUG-0898 — at least one plan price is checkout-ready | happy | `checkoutReady: true` somewhere | PARTIAL | PKR `PER_SEAT` `MONTHLY` is `SYNCED` / `checkoutReady: true`; other prices `NOT_SYNCED`; all synced rows are `stripeEnvironment: TEST` |
| S12 | BUG-0903 — production is in Stripe live mode | contract | `stripeEnvironment: LIVE` | **FAIL** | every synced price reports `stripeEnvironment: "TEST"` |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npx --workspace api jest <9 specs>` | API regression specs | 58 | 0 | 0 | 38.5s |
| `npx --workspace admin jest <6 specs>` | Admin runtime regression specs | 57 | 0 | 0 | 6.6s |
| `npx jest --config jest.config.js lib/subscribe-selection.spec.ts` | Landing selection | 19 | 0 | 0 | 0.7s |

Totals: **16 suites, 134 tests, 0 failures.**

### Regression-test proof

Not re-derived in this run. Each of REG-226..REG-242 recorded its own
fails-without-the-fix proof at the time it was written, and this run does not
duplicate that work. This is a limitation of *this* run, recorded rather than
claimed away.

| Test | With fix | Without fix (stashed) |
|---|---|---|
| REG-226..REG-242 | PASS (this run) | proven at authoring time, not re-run here |

## Manual Validation

Production was probed read-only from outside:

- `GET https://api.dijipeople.com/api/health` returns `commit 6ed7a44`, `environment production`.
- `GET https://api.dijipeople.com/api/public/legal` returns two published documents.
- `GET https://api.dijipeople.com/api/public/plans?countryCode=PK` returns readiness flags per price.
- `GET https://www.dijipeople.com/legal/privacy` and `/legal/not-a-real-document` return `200` and `404`.
- `POST https://api.dijipeople.com/api/billing/stripe/webhook` with a deliberately
  invalid `stripe-signature`. This can never be processed as a real event, so it
  is safe; its purpose was to separate three indistinguishable 400s. It returned
  `"Invalid Stripe webhook signature."`, which proves the raw-body pipeline in
  `main.ts` `configureBodyParsing` is intact and the failure is `constructEvent`
  rejecting the signature — a **secret mismatch**, not a code defect.
- Render service logs (1,000 lines) were read for `outbox`, `stripe`, `webhook`
  and `migrat` signals.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| REG-226 | Lockfile regenerates from the manifests | PASS (CI step present) |
| REG-227 | Payment re-check advances a stuck order | PASS |
| REG-228 | Production tenant URLs are HTTPS and not `vercel.app` | PASS |
| REG-229 | A document declaring itself a draft is not published | PASS |
| REG-230 | Qatar resolves to its own market, not GCC | PASS |
| REG-231 | Checkout quotes the visitor-market currency | PASS |
| REG-232 | The plan Pricing tab is reachable | PASS |
| REG-233 | New columns are not hidden by saved preferences | PASS |
| REG-234 | List summaries carry `createdById` | PASS |
| REG-235 | Plan-price DTO accepts the admin payload | PASS |
| REG-236 | A FLAT plan order records its real total | PASS |
| REG-237 | Provisioning completes inside the transaction budget | NOT RE-RUN — e2e; see Known Limitations |
| REG-238 | A ready workspace is marked ready | PASS by call-site check (S6) |
| REG-239 | Unknown legal slug returns 404 | PASS in production (S5) |
| REG-240 | A disallowed CORS origin is refused without a 500 | PASS |
| REG-241 | Plan entitlements survive a save | PASS |
| REG-242 | A stale Stripe product id is replaced, not fatal | PASS |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| — | — | No new defect. Two existing records are **confirmed still live** (BUG-0989, BUG-0903) and two are **confirmed resolved by reality** (BUG-0899, BUG-0906). BUG-0989's root cause is newly established here. | `doc-code-drift` | — |

## Known Limitations

- **No local database.** Every suite run here is a unit suite. The e2e suites
  (`e2e/tests/landing-checkout-provisioning.spec.ts`,
  `landing-public-surface.spec.ts`) need a full running stack — API, landing,
  Postgres, Stripe test keys, the outbox worker — and were not run.
- **REG-237 (BUG-0900) was not re-executed.** Its fix is present in
  `permission-bootstrap.service.ts` and its own record documents an end-to-end
  run in which `PROVISIONING_REQUESTED` reached `PROCESSED` and tenant
  `qa-qamt5jeqw6` was created `ACTIVE`. That is real evidence gathered at fix
  time, but it is not evidence gathered *here*, and the distinction is kept.
- **Fails-without-the-fix was not re-derived**, as stated above.
- **Production environment variables could not be read.** The tooling policy in
  this environment refused the Render env-var API call, so `OUTBOX_WORKER_ENABLED`
  (BUG-0904) and `DIRECT_URL` vs `DIRECT_DATABASE_URL` (BUG-0905) could not be
  settled by direct inspection. Both were assessed indirectly and neither is
  closed by this run.

## Final QA Verdict

**PASS WITH RISKS.**

Sixteen suites and 134 tests pass, and every regression test named by
REG-226..REG-242 exists and is green at `0a5586f`. Thirteen records are verified
by executed output in this run; BUG-0902 and BUG-0163 by a contract check that
is the whole of what their regression describes; BUG-0907 by production
behaviour. The risks are the three stated limitations — no e2e execution, no
stash-and-rerun proof, and no read of the production environment. None of them
undermines the finding this run was created to establish: **these records were
stalled on an unrun QA step, not on missing engineering.**

BUG-0900 is deliberately **not** advanced to `VERIFIED` on this run's evidence.
Everything else in the sixteen is.

## Follow-up

- **BUG-0989 is diagnosed and needs one operator action** — align
  `STRIPE_WEBHOOK_SECRET` on `srv-d7js7fqqqhas739v4i7g` with the signing secret
  of the Stripe endpoint actually delivering to it. No code change.
- **BUG-0904 and BUG-0905 need a read of the production environment** to be
  closed either way.
- **BUG-0900 needs one e2e execution** to move off `FIXED`.
- **ITEM-0078** (no end-to-end payment to provisioning run against Stripe test mode)
  remains the standing gap that would have caught BUG-0989 before a customer did.
