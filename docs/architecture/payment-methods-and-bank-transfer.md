# Payment methods and bank-transfer settlement

Decision record: ADR-0029. Plan: EXECPLAN-0056. Operations: `docs/billing/bank-transfer-operations-runbook.md`.

## Model (migration `20261112090000_payment_methods_and_bank_transfer`, additive)

| Model / column | Purpose |
|---|---|
| `PaymentMethodConfiguration` | One row per (market, currency, method key, environment): `enabled`, `approvalStatus`. Unique on that tuple. Created disabled + unapproved. |
| `BankReceivingAccount` | Encrypted `account title / IBAN / account number / Raast id`, a separately stored masked projection, `status`, `isActive`. A partial unique index allows **one active account per method**. |
| `BankTransferClaim` | A customer assertion (first purchase → `subscriptionOrderId`) **or** an operator-recorded renewal credit (`invoiceId`). A CHECK constraint requires exactly one target. `bankStatementReferenceHash` is **unique**: one bank credit settles one thing. |
| `BankTransferEvidence` | Private file metadata (`storageKey`, checksum, scan status). Never proof of payment. |
| `SubscriptionOrder.{paymentMethodConfigId, receivingAccountId, bankReference, bankInvoiceIssuedAt}` | The frozen bank invoice. `bankReference` is unique and random (`DP-XXXX-XXXX`, no look-alike characters). `expiresAt` is the due date. |
| `Invoice.bankReference` | Renewal invoice reference for bank-paid subscriptions. Unique. |
| `PaymentProvider.BANK_TRANSFER` | How a bank-paid subscription is recorded; see ADR-0029 §5. |

Enums: `BillingPaymentMethodKey`, `PaymentMethodEnvironment`,
`PaymentMethodApprovalStatus`, `ReceivingAccountStatus`,
`BankTransferClaimStatus`, `PaymentEvidenceScanStatus`.

## Availability (server-decided)

`PaymentMethodRegistryService` is the single source. A method is public only when
all of these hold: a configuration row for the priced selection's market and
currency, `enabled`, `APPROVED`, an environment valid for the running deployment
(SANDBOX never in a production-like runtime), and for a bank transfer an
`APPROVED` + active receiving account and a configured `SECRET_ENCRYPTION_KEY`.

Card gateways keep their own credential/production guards; the registry can only
**withdraw** one. No row means "no opinion" (behaviour before this feature), so
nothing changes until an operator configures a market. USD never falls back to a
PKR method: configuration is keyed by (market, currency).

`GET /public/payment-methods?planPriceId=` returns the options for one priced
selection (never from the request's market) and `assistedInvoiceFallback` when no
bank account is ready.

## First-purchase lifecycle

```
wizard ─ owner email verified ─ POST /public/subscribe {paymentMethod: BANK_TRANSFER}
   └─ issueInvoice: order PENDING_PAYMENT, bankReference, receivingAccountId,
      paymentProvider = BANK_TRANSFER, due 7 days            (idempotent, race-safe)
buyer ─ GET  /public/onboarding/:id/bank-transfer      invoice + decrypted instructions
      ─ POST …/bank-transfer/claims (multipart)        claim PENDING_VERIFICATION (never activates)
      ─ POST …/bank-transfer/cancel                    only before any claim exists
operator ─ POST /super-admin/payments/bank-transfers/:id/approve
   └─ tx: claim → APPROVED (conditional, statement ref unique), order still PENDING_PAYMENT
   └─ OrderActivationService.confirmPayment → PAYMENT_CONFIRMED outbox → provisioning
   └─ provisioning → recordOrderPayment writes PAID Invoice + SUCCEEDED Payment
      (BANK_TRANSFER, bankReference) once
```

Guards: exact amount in minor units; currency match; unique statement reference;
order re-checked inside the transaction; claim states
`PENDING_VERIFICATION → CLARIFICATION_REQUESTED | APPROVED | REJECTED | DUPLICATE | EXPIRED | CANCELLED`.
The order sweeper never ages out an order with an open claim.

## Renewals, expiry, refunds

- `ManagedRenewalService` already runs every non-Stripe subscription; it now
  includes `BANK_TRANSFER` (renewal invoice with a `bankReference`, PAST_DUE after
  the period, grace, expiry). It skips gateway reconciliation for it.
- `BankTransferService.recordInvoicePayment` (operator) creates an approved claim
  + a PENDING payment and calls `PaymentSettlementService.creditBankPayment`, the
  same transaction that credits a provider payment (invoice paid, period extended).
  Replays find the existing payment on `(BANK_TRANSFER, bankReference)`.
- `sendRenewalReminders` mails once per stage (issued / due soon / overdue); the
  mail idempotency key carries the stage.
- A bank payment is refunded manually; `refundPayment` requires the bank's
  reference and records a `RefundRequest` (PROCESSED) and `REFUNDED` payment.

## Surfaces and routes

Public (rate-limited, no tenant input): `GET public/payment-methods`,
`POST|GET public/onboarding/:id/bank-transfer`, `…/claims`, `…/cancel`.

Platform (`super-admin/…`): `payments/bank-transfers[/summary|/renewal-invoices|/:id|/:id/evidence/:eid]`,
`…/:id/approve|reject|request-clarification|mark-duplicate`,
`…/invoices/:invoiceId/record`, `billing/payment-methods[/:id/approval|enabled|accounts]`,
`billing/receiving-accounts/:id/approve|reject|suspend|activate`.

Frontends: landing wizard + `/subscribe/bank-transfer`; admin Billing →
*Bank transfers* and *Payment methods*; tenant Settings → Billing shows the
reference and bank details on an open bank renewal invoice.

## Trust boundaries (what a reviewer should re-check)

1. No endpoint accepts a tenant id, price, tax, discount, status or approval state.
2. Evidence is stored under the platform scope (`payment-evidence`), served only to
   `payments.read` operators as an attachment with `nosniff` and a sandbox CSP,
   and every view is audited. Content type comes from the bytes, never the name.
3. Every operator decision writes a platform audit row (actor, reference, amount).
4. Audit snapshots carry the masked account, never the identifiers.
5. `PaymentGateways.isManaged(BANK_TRANSFER)` is false: no gateway path can run.
