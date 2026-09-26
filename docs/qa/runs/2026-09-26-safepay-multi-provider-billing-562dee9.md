# QA Run — safepay-multi-provider-billing

## Metadata

| | |
|---|---|
| Date / time | 2026-09-26T12:38:12.218Z |
| Branch | `agent/billing-safepay-provider` |
| Commit SHA | `562dee918abc8633bca402ec68bf476e5d012a5f` (base; the change was uncommitted at run time) |
| Worktree | `D:\My Work\hrm-dijipeople\wt-billing-safepay` |
| Environment | Working tree dirty with this task's change only. DB: disposable local PostgreSQL `dijipeople_safepay_test` (full migration history + `seed:config` + `seed:commercial`). External services: none — Safepay was faked at the adapter's `fetch`; no sandbox credentials were available. |
| QA agent | Architect (SESSION-0108) |
| Scope | Safepay as a second payment provider for PKR: routing, checkout, settlement, webhook, renewals/grace, coupons, provisioning of a Safepay-paid public order, entitlement, admin and tenant UI; plus regression of the existing Stripe billing suites. Not covered: a real Safepay sandbox transaction. |

## Requirement

Add Safepay for PKR while keeping Stripe unchanged, with DijiPeople — not the
provider — the system of record for subscription state and access. Design and
operations: `docs/billing/safepay.md`.

## Risk Areas

- Money becoming access without a verified matching payment; double credit when
  a webhook, the return page and the sweeper confirm at once.
- Forged or replayed webhooks; the raw-body parser covering the new route.
- Stripe regressions in the shared checkout entry points, the Stripe webhook,
  `confirmPayment` and plan changes.
- Entitlement: the new grace rule must not change Stripe's `past_due`.
- Tenant isolation on the new tenant routes (`payments/:id`, `invoices/:id/pay`).
- Migration safety on a database with existing Stripe rows.

## Scenarios

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| S1 | Provider says paid for the exact amount | happy | payment SUCCEEDED, invoice PAID, subscription ACTIVE one interval | PASS | QA-BILLING-038 · `payment-settlement.service.spec.ts` |
| S2 | Pending / terminal failure / wrong amount / wrong currency | negative | no activation; mismatch raises CRITICAL | PASS | QA-BILLING-038 |
| S3 | Five concurrent confirmations on real Postgres | concurrency | exactly one credit, no phantom refund | PASS | QA-BILLING-039 · `managed-payment-settlement.e2e-spec.ts` |
| S4 | Forged, tampered, replayed webhook (unit and live HTTP on :4099) | idempotency / security | 400, 400, `duplicate: true` | PASS | QA-BILLING-040 · live probe below |
| S5 | Currency routing with Safepay on and off | contract | PKR→Safepay only while enabled | PASS | QA-BILLING-041 |
| S6 | Period boundaries, grace, expiry, cancel-at-period-end | state machine | as `periodBoundaryTransition` | PASS | QA-BILLING-042 |
| S7 | Server pricing, coupons, reuse, 409, other tenant | permission / tenant | as QA-BILLING-043 | PASS | QA-BILLING-043 |
| S8 | Stripe-only paths with Safepay off | regression | unchanged | PASS | `billing-price-market-scoping.spec.ts`, `checkout-draft-id-reaches-the-order.spec.ts`, `payment-authorised-provisioning.e2e-spec.ts` |
| S9 | Migration on a fresh database | migration | applies; DB matches schema for every new column/table | PASS | `prisma migrate deploy` + `migrate diff` |

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npx jest` (services/api) | all API unit | 7473 | 1 | 0 | ~6 min |
| `npx jest src/modules/billing …` | billing, security, guards, platform-auth, super-admin | 728 | 0 | 0 | ~2 min |
| `npx jest --config ./test/jest-e2e.json` (3 suites) | settlement, provisioning, seat/plan change on real Postgres | 25 | 0 | 0 | ~40 s |
| `npm --workspace web run test` | web | 2037 | 0 | 0 | — |
| `npm --workspace admin run test` | admin | 482 | 0 | 0 | — |
| `check-types` api / web / admin | typecheck | ✓ | — | — | — |

The one API failure is `MfaService › replaces the pending seed when setup is
started again`: `auth/` is untouched by this change and the file passes 21/21
alone. It is TOTP timing under full-suite load, pre-existing.

### Regression-test proof

Not a bug fix: the new behaviour has no prior implementation to stash. The
negative cases (mismatch, forged signature, duplicate delivery, concurrent
credit) are the proof that the guards are exercised.

## Manual Validation

The API was booted on port 4099 against the disposable database. Every new
route mapped; unauthenticated `GET /billing/payments/:id`,
`POST /billing/invoices/:id/pay`, `POST /billing/subscription/cancel` and
`POST /super-admin/payments/:id/refund` answered 401; the Safepay webhook
answered 503 while unconfigured. With a test webhook secret: forged 400,
signed 200 (`IGNORED`, no tracker), redelivery `duplicate: true`, tampered 400.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| QA-BILLING-005 / 008 / 010 | public subscribe owns money, no tenant before payment, email gate | PASS (provisioning e2e) |
| QA-BILLING-006 / 037 | plan changes and their runner | PASS |
| QA-BILLING-035 | tenant listing/checkout honour publication and market | PASS |
| QA-TENANT-051 | Stripe webhook names the refusing check | PASS |

## Bugs Found

Raised by the Reviewer against this task's own unmerged code, triaged
`FIX_NOW` by the Architect, and fixed before integration. None reached
`develop`, so none has a `docs/bugs/` record; each is guarded by a test shown
failing with its fix removed, and the reusable race is promoted as
QA-BILLING-044.

| # | Severity | Description | Disposition | Regression test (fails without fix) |
|---|---|---|---|---|
| 1 | HIGH | Period-boundary write guarded on status only; a renewal paid between read and write was expired | FIXED — guard on `currentPeriodEnd`, `cancelAtPeriodEnd`, `gracePeriodEndsAt` | `managed-renewal.service.spec.ts` ✓ mutation-proven |
| 2 | HIGH | Paying a renewal after a lapse left `autoRenew: false`; no further renewal was ever invoiced | FIXED — `renew()` restores `autoRenew`, clears `cancelAtPeriodEnd` | `payment-settlement.service.spec.ts` "turns renewals back on" ✓ |
| 3 | MEDIUM | Plan change after a renewal invoice: billed at the old price or reverted | FIXED — managed changes apply on payment in `renew()`, the date sweep skips them, an unpaid renewal is voided on request | "applies the scheduled plan change…" |
| 4 | MEDIUM | A stale renewal paid after re-subscribing moved `currentPeriodEnd` backwards | FIXED — never lower the paid-through date (refund instead); open renewals voided on EXPIRED/CANCELED and on activation | "refunds a renewal for a period…" ✓ |
| 5 | MEDIUM | Two different payments for one invoice both credited | FIXED — `SELECT … FOR UPDATE` on the subscription, conditional invoice claim | `managed-payment-settlement.e2e-spec.ts` "credits one of two…" ✓ DB, mutation-proven |
| 6 | MEDIUM | Second paid tracker on an already-paid public order kept silently | FIXED — `RefundRequest` + CRITICAL event, once per tracker | "raises a refund for a second paid checkout…" ✓ |
| 7 | MEDIUM | Safepay on with the renewal worker off leaves subscriptions entitled for ever | FIXED — production boot logs an ERROR (not fatal: one instance runs the worker) | log only; documented |
| 8 | LOW | Concurrent operator refunds; partial refund marked the payment REFUNDED | FIXED — refund claimed under a per-payment lock; partial refund keeps it paid | gateway spec refund cases |
| 9 | LOW | Existing STRIPE-stamped subscription's Safepay invoice not payable | FIXED — checkout re-stamps the provider | covered by checkout path |

## Known Limitations

- No Safepay sandbox credentials: the adapter was verified against Safepay's
  published SDK and plugin source and pinned by unit tests with a faked
  `fetch`, not against the live sandbox. The refund body and webhook signing
  input are unconfirmed — ITEM-0209.
- Frontend states were verified by typecheck, lint and existing component
  tests, not in a browser.

## Final QA Verdict

**PASS WITH RISKS**

The change behaves as specified on every automated and DB-backed path, and the
Stripe suites are unchanged. Risks: the live Safepay contract is unconfirmed
until a sandbox run (ITEM-0209), and Safepay stays switched off until the owner
decides the cut-over (ITEM-0210).

## Follow-up

ITEM-0209 (sandbox confirmation, blocked on credentials), ITEM-0210 (cut-over
decision), ITEM-0211–0214 (deferred follow-ups).

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[ITEM-0209]] · [[ITEM-0210]] · [[ITEM-0211]] · [[QA-BILLING-005]] · [[QA-BILLING-006]] · [[QA-BILLING-035]] · [[QA-BILLING-038]] · [[QA-BILLING-039]] · [[QA-BILLING-040]] · [[QA-BILLING-041]] · [[QA-BILLING-042]] · [[QA-BILLING-043]] · [[QA-BILLING-044]] · [[QA-TENANT-051]] · [[SESSION-0108]]

<!-- GRAPH:END -->
