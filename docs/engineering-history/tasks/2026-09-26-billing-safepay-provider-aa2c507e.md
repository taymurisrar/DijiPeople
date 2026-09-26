# Engineering History — Safepay for PKR alongside Stripe

| | |
|---|---|
| **Task Title** | Multi-provider billing: Safepay for PKR alongside Stripe, with DijiPeople owning the subscription |
| **Task Type** | FEATURE (LARGE; includes an additive MIGRATION) |
| **Date** | 2026-09-26 |
| **Architect Plan** | NOT_APPLICABLE — the migration is additive (nullable columns, one enum, one table, a deterministic backfill of rows Stripe already created), so no destructive-change ExecPlan was required; the design is recorded in `docs/billing/safepay.md` |
| **Agents Used** | Architect (design, implementation, integration); Research (Safepay API, verified against Safepay's own SDK and WooCommerce plugin source); Explore (billing frontend and Prisma audit); Reviewer (independent pass, REWORK with nine findings, all fixed). Not used: Release/DevOps (not deployed; `main` untouched) |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/billing-safepay-provider` |
| **Base SHA** | `562dee918abc8633bca402ec68bf476e5d012a5f` (rebased three times onto a moving `develop`; final base `97b75ce6`) |
| **Final Task SHA** | `aa2c507e2a52ee18f69dd3dbda57fe4b4e58b9fe` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — fast-forward; `develop` ref-pushed to the CI-verified tip `aa2c507e` |
| **Final Target SHA** | `aa2c507e2a52ee18f69dd3dbda57fe4b4e58b9fe` (this closure commit follows the same way) |

### Commits

```
aa2c507e feat(billing): Safepay for PKR alongside Stripe, with DijiPeople owning the subscription
```

### Files Changed

103 file(s) in `aa2c507e`.

```
M	.agent/context/component-index.md
M	.env.development.example
M	.env.example
M	.env.production.example
M	apps/admin/app/(internal)/billing/page.tsx
A	apps/admin/app/_components/billing/provider-payments-client.tsx
A	apps/admin/app/api/super-admin/billing/provider-events/route.ts
A	apps/admin/app/api/super-admin/payments/[paymentId]/refund/route.ts
A	apps/admin/app/api/super-admin/payments/[paymentId]/verify/route.ts
M	apps/admin/lib/runtime/platform-module-registry.ts
M	apps/web/app/(authenticated)/settings/billing/_components/billing-settings-client.tsx
A	apps/web/app/(authenticated)/settings/subscription/_components/payment-status-panel.tsx
M	apps/web/app/(authenticated)/settings/subscription/cancel/page.tsx
M	apps/web/app/(authenticated)/settings/subscription/success/page.tsx
A	apps/web/app/api/billing/invoices/[invoiceId]/pay/route.ts
A	apps/web/app/api/billing/payments/[paymentId]/route.ts
A	apps/web/app/api/billing/subscription/cancel/route.ts
A	apps/web/app/api/billing/subscription/resume/route.ts
M	docs/backlog/blocked.md
M	docs/backlog/deferred.md
M	docs/backlog/index.md
A	docs/backlog/items/ITEM-0209-confirm-the-safepay-refund-request-body-and-webhook-signing-.md
A	docs/backlog/items/ITEM-0210-decide-when-pkr-checkout-moves-to-safepay-and-what-happens-t.md
A	docs/backlog/items/ITEM-0211-safepay-renewal-invoices-are-issued-but-never-emailed-to-the.md
A	docs/backlog/items/ITEM-0212-public-signup-offers-no-promotion-code-field-for-safepay-rou.md
A	docs/backlog/items/ITEM-0213-mid-period-seat-increases-on-a-safepay-subscription-are-not-.md
A	docs/backlog/items/ITEM-0214-flipping-safepay-enabled-while-a-pkr-stripe-checkout-is-open.md
M	docs/backlog/product-decisions.md
A	docs/billing/safepay.md
M	docs/environment-variables.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/knowledge/data-model/domain-map.md
M	docs/knowledge/data-model/entity-subscription.md
M	docs/knowledge/modules/billing.md
M	docs/qa/coverage-matrix.md
A	docs/qa/runs/2026-09-26-safepay-multi-provider-billing-562dee9.md
A	docs/qa/scenarios/QA-BILLING-038-a-safepay-payment-activates-a-subscription-only-on-the-provi.md
A	docs/qa/scenarios/QA-BILLING-039-concurrent-confirmations-of-one-safepay-payment-credit-it-ex.md
A	docs/qa/scenarios/QA-BILLING-040-a-forged-tampered-or-replayed-safepay-webhook-changes-nothin.md
A	docs/qa/scenarios/QA-BILLING-041-pkr-routes-to-safepay-only-while-safepay-is-enabled-and-ever.md
A	docs/qa/scenarios/QA-BILLING-042-a-dijipeople-billed-subscription-moves-through-grace-expiry-.md
A	docs/qa/scenarios/QA-BILLING-043-a-safepay-checkout-is-priced-on-the-server-and-a-fixed-coupo.md
A	docs/qa/scenarios/QA-BILLING-044-a-renewal-paid-or-a-cancellation-revoked-while-the-billing-s.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-020-billing.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0108-multi-provider-billing-safepay-for-pkr-alongside-stripe.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	packages/config/platform-runtime-schema.generated.json
M	render.yaml
A	services/api/prisma/migrations/20260926120000_payment_provider_and_safepay/migration.sql
M	services/api/prisma/schema.prisma
M	services/api/src/common/errors/error-catalog.ts
M	services/api/src/common/guards/public-write-rate-limit.invariant.spec.ts
A	services/api/src/common/security/tenant-entitlement.rule.spec.ts
M	services/api/src/common/security/tenant-entitlement.rule.ts
M	services/api/src/common/security/tenant-entitlement.service.ts
M	services/api/src/main.ts
M	services/api/src/modules/billing/billing-seat-pricing.ts
M	services/api/src/modules/billing/billing.module.ts
M	services/api/src/modules/billing/controllers/billing.controller.ts
M	services/api/src/modules/billing/controllers/public-billing.controller.ts
A	services/api/src/modules/billing/controllers/safepay-webhook.controller.spec.ts
A	services/api/src/modules/billing/controllers/safepay-webhook.controller.ts
A	services/api/src/modules/billing/managed-billing.rules.spec.ts
A	services/api/src/modules/billing/managed-billing.rules.ts
A	services/api/src/modules/billing/promotion-evaluation.spec.ts
M	services/api/src/modules/billing/promotion-pricing.ts
A	services/api/src/modules/billing/providers/payment-gateway.ts
A	services/api/src/modules/billing/providers/payment-gateways.ts
A	services/api/src/modules/billing/providers/payment-provider.resolver.spec.ts
A	services/api/src/modules/billing/providers/payment-provider.resolver.ts
A	services/api/src/modules/billing/providers/safepay.gateway.spec.ts
A	services/api/src/modules/billing/providers/safepay.gateway.ts
M	services/api/src/modules/billing/services/billing-price-market-scoping.spec.ts
M	services/api/src/modules/billing/services/billing.service.ts
M	services/api/src/modules/billing/services/checkout-draft-id-reaches-the-order.spec.ts
A	services/api/src/modules/billing/services/managed-billing.worker.ts
A	services/api/src/modules/billing/services/managed-checkout.service.spec.ts
A	services/api/src/modules/billing/services/managed-checkout.service.ts
A	services/api/src/modules/billing/services/managed-renewal.service.spec.ts
A	services/api/src/modules/billing/services/managed-renewal.service.ts
M	services/api/src/modules/billing/services/order-activation.service.ts
A	services/api/src/modules/billing/services/payment-settlement.service.spec.ts
A	services/api/src/modules/billing/services/payment-settlement.service.ts
M	services/api/src/modules/billing/services/plan-change.service.ts
M	services/api/src/modules/billing/services/stripe-billing.service.ts
M	services/api/src/modules/billing/services/subscription-order.service.ts
M	services/api/src/modules/billing/services/webhook.service.ts
M	services/api/src/modules/platform-auth/platform-permissions.spec.ts
M	services/api/src/modules/super-admin/billing.service.ts
A	services/api/src/modules/super-admin/dto/refund-provider-payment.dto.ts
M	services/api/src/modules/super-admin/platform-onboarding.service.ts
M	services/api/src/modules/super-admin/provisioning-requested.handler.ts
M	services/api/src/modules/super-admin/super-admin.controller.ts
M	services/api/src/modules/super-admin/super-admin.service.ts
M	services/api/src/modules/tenant-settings/feature-access.service.ts
A	services/api/test/managed-payment-settlement.e2e-spec.ts
M	services/api/test/payment-authorised-provisioning.e2e-spec.ts
```

## Conflicts

Three rebases onto `develop` while SESSION-0107 and SESSION-0109 integrated.
Every conflict was a **generated index** (type: derived artifact) — backlog,
QA, session and task indexes, dashboards, the component index, coverage
matrix. Source files that both sides touched (`platform-permissions.ts` and
its spec, `super-admin.controller.ts`, `super-admin.service.ts`,
`error-catalog.ts`) merged without conflict.

## Conflict Resolutions

Took `develop`'s side of every generated file wholesale and re-ran every
generator, so each index is derived from the union of both sides' records.
Hand-merging the hunks would have produced an index matching neither branch,
and taking this branch's side would have dropped the other sessions' records
(ITEM-0200/0201/0203/0204/0206, BUG-3668, SESSION-0107/0109) from the indexes.
The auto-merged source was re-verified: API typecheck, 1,106 affected unit
tests including the new permission-tier spec, and the admin tests.

## QA

| | |
|---|---|
| **QA Report** | [[2026-09-26-safepay-multi-provider-billing-562dee9]] — PASS WITH RISKS (live Safepay sandbox unconfirmed) |
| **Bug IDs** | None created: the nine Reviewer findings were defects in this task's unmerged code, fixed before integration and each guarded by a test shown failing without its fix (recorded in the QA run) |
| **Backlog Items** | Created [[ITEM-0209]] (BLOCKED_EXTERNAL), [[ITEM-0210]] (PRODUCT_DECISION), [[ITEM-0211]], [[ITEM-0212]], [[ITEM-0213]], [[ITEM-0214]] (DEFER) |

Scenarios promoted: [[QA-BILLING-038]] to [[QA-BILLING-044]].

## CI

| | |
|---|---|
| **CI Run ID** | 36248129563 |
| **CI Result** | PASS on `aa2c507e` — the exact SHA `develop` was fast-forwarded to |

An earlier run (36245007509, on `b2a82899`) failed only the record-graph
step of Framework validation; the generator was run and the full framework
job was run locally before every later push.

## Post-Merge Validation

`develop` equals the CI-verified SHA, so run 36248129563 is the validation of
the merged result. Locally on the rebased tip: `tsc -p tsconfig.build.json`
(api), `check-types` (web, admin), 1,106 billing/super-admin/platform/common
unit tests, admin tests, and every step of the Framework validation job — all
pass. Before the rebases: full API unit suite 7,482/7,482, web 2,037, admin
482, and 25/25 DB-backed e2e tests against a disposable PostgreSQL with the
migration applied from a fresh history.

## Release / Deployment Impact

None — not deployed; `main` untouched. When released, the migration is
additive (rollback class: forward-fix; the columns are nullable and unused
while Safepay is off). `SAFEPAY_ENABLED` defaults to false, so a release
changes nothing for a live buyer until the owner decides the cut-over
(ITEM-0210).

## Knowledge Capture

- `docs/knowledge/modules/billing.md` — new section "Two kinds of payment
  provider": Stripe stays the recurring engine, Safepay is DijiPeople-billed,
  and which side a billing rule belongs on (architecture).
- `docs/billing/safepay.md` — flows, state machine, webhook, configuration
  and known limitations (operations).
- `docs/environment-variables.md` — the Safepay and managed-billing variables.
- Lesson recorded in the QA run and QA-BILLING-044: a conditional write must be
  guarded on every field the decision was read from, not on status alone.

## Obsidian Sync

`npm run knowledge:sync` ran after the merge: 40 notes written, 1,687
already current. `knowledge:verify` reported GRAPH_ORPHAN for eight
BUG-32xx notes owned by other sessions (untouched) and for this record's
unfilled scaffold, which this filled record replaces on the re-sync.

## Cleanup

Session SESSION-0108 finished and its record set COMPLETE; the `schema`
lease had already lapsed. The task worktree
`D:/My Work/hrm-dijipeople/wt-billing-safepay` is removed with
`npm run worktree:remove` and the task branch deleted once this closure
commit is on `develop`. The disposable database `dijipeople_safepay_test`
is kept, per the throwaway-database convention.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-3668]] · [[ITEM-0200]] · [[ITEM-0209]] · [[ITEM-0210]] · [[ITEM-0211]] · [[ITEM-0212]] · [[ITEM-0213]] · [[ITEM-0214]] · [[PLAN-020]] · [[QA-BILLING-038]] · [[QA-BILLING-039]] · [[QA-BILLING-040]] · [[QA-BILLING-041]] · [[QA-BILLING-042]] · [[QA-BILLING-043]] · [[QA-BILLING-044]] · [[SESSION-0107]] · [[SESSION-0108]] · [[SESSION-0109]] · [[TASK-0005]]

<!-- GRAPH:END -->
