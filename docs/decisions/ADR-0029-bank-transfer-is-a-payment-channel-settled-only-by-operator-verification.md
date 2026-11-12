---
ID: ADR-0029
aliases: [ADR-0029]
Title: Bank transfer is a payment channel settled only by operator verification
Status: ACCEPTED
CreatedAt: 2026-11-12
UpdatedAt: 2026-11-12
---
# ADR-0029 - Bank transfer is a payment channel settled only by operator verification

## Status

Accepted - 2026-11-12. Implements the architecture of EXECPLAN-0056 (TASK-0038,
GitHub issue #137, PR #136).

## Context

DijiPeople must collect real PKR subscription payments in Pakistan before Safepay
has merchant approval, and without depending on Stripe. Bank transfer / Raast is
the only method that can carry real money today. It differs from a card gateway
in the one way that matters: **nothing confirms it automatically**. A customer's
receipt, screenshot, transaction id or browser redirect is an assertion, not
evidence that money reached the account.

## Decision

1. **A bank transfer is a payment channel, not a gateway.** Availability of every
   channel is decided by a server-owned `PaymentMethodConfiguration` row per
   market, currency, method and environment, plus runtime readiness checks. The
   client never decides what is offered.
2. **A customer claim is data, never authority.** `BankTransferClaim` records what
   the buyer says they did. Only an operator holding `payments.verify`, who has
   seen the credit in the receiving account, can settle: they record the amount
   and the bank's own statement reference. The server requires the amount to
   match the frozen invoice **to the minor unit**, and the statement reference is
   unique in the database, so one bank credit can settle one thing, ever.
3. **Settlement reuses the existing activation path.** An approved claim calls the
   same idempotent `OrderActivationService.confirmPayment` that Stripe and Safepay
   use, so provisioning, outbox and onboarding follow unchanged. Nothing new can
   activate a subscription.
4. **The pre-tenant invoice is the order.** `Invoice` and `Payment` stay
   tenant-required. Before a tenant exists the frozen `SubscriptionOrder` is the
   pro-forma invoice (amount, tax, discount, seats, currency, due date, unique
   `bankReference`). The tax `Invoice` and the `Payment` are written at
   provisioning, as the Safepay path already does, keyed on
   `(BANK_TRANSFER, bankReference)` so a replay cannot record money twice.
5. **`BANK_TRANSFER` is a `PaymentProvider` value.** Not because a gateway executes
   it, but so a bank-paid subscription records how it is paid and the renewal,
   grace and period-boundary sweeps that already run every non-Stripe subscription
   cover it. `PaymentGateways.isManaged` returns false for it: no gateway path may
   ever try to call one.
6. **Separation of duties where money is routed.** Approving or enabling a method
   and approving or activating a receiving account need
   `platform.billing.administer`; an account cannot be approved by the operator who
   entered it. Deciding a transfer needs the narrower finance permission
   `payments.verify`.
7. **Bank details are encrypted at rest and masked in every list.** Only the buyer
   holding an issued invoice's order id (a v4 uuid, the capability the wizard
   already holds) sees decrypted instructions. The system fails closed when
   `SECRET_ENCRYPTION_KEY` is absent.
8. **One way to pay an order.** A bank invoice and a card checkout can never coexist
   on one order; the lock is enforced in both directions.
9. **No real merchant data in the repository.** No account, IBAN or Raast id is
   seeded or defaulted. With no approved account the checkout shows the honest
   "request a bank-transfer invoice" fallback (a sales lead), never invented
   instructions.

## Consequences

- Evidence files are stored privately, quarantined, magic-byte validated and only
  ever served to an operator as a forced download. **No malware scanner exists**;
  the residual risk (a malicious PDF aimed at an operator's viewer) is mitigated
  by type restriction, forced download, `nosniff`, a sandboxing CSP and the rule
  that a file can never settle anything. Adding a scanner is follow-up work.
- Renewals are billed by invoice and recorded by an operator against the invoice
  reference. A tenant-side "I have paid" claim for a renewal is not built; the
  tenant sees the reference and bank details on the invoice and finance records
  the credit.
- Plan and seat changes continue through the existing change services and produce
  invoices that a bank-paid tenant settles the same way as a renewal.
- Tenant erasure removes a renewal claim record through its invoice relation
  (`TENANT_ERASURE_LINK_CLEANUPS`); first-purchase claims hang off the retained
  order.
- Production still needs an owner-supplied, legally eligible receiving account
  before any customer can be shown instructions (see the runbook).

## Alternatives rejected

- **Nullable `tenantId` on `Invoice`/`Payment`** to hold pre-tenant money: touches
  every projection that assumes a tenant and duplicates what the order already
  freezes.
- **A separate "manual payment" subsystem** with its own state machine and
  subscription lifecycle: a second source of truth for renewal, grace and expiry.
- **Auto-approving on a matching claim** (amount and reference match): the
  customer controls every input, so it would let anyone activate a workspace.
