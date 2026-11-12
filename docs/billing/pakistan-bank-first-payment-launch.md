# Pakistan payment launch — bank transfer first

Updated: 2026-11-12. Supersedes the 2026-11-04 interim note. Bank-transfer
collection, operator verification, renewal and refund are now implemented
(EXECPLAN-0056, ADR-0029). Operations: `bank-transfer-operations-runbook.md`.
Design: `docs/architecture/payment-methods-and-bank-transfer.md`.

## Decisions that stand

- Only the predefined Starter, Growth and Enterprise catalogue plans plus
  explicitly configured custom plans. No new predefined plan.
- **Bank transfer / Raast is the primary real-payment method for PKR.** It is
  offered only when the server reports an approved, active receiving account for
  the price's market and currency.
- **Safepay** stays sandbox-only. It is never offered as a live method in a
  production-like deployment (startup fails if sandbox is enabled there), and
  production routing needs merchant approval first (gates below).
- **Stripe** code and USD integration are preserved but hidden from public
  checkout until a live key is configured. Nothing forces a USD buyer onto a
  Pakistani method.
- No account detail is hardcoded, seeded or defaulted anywhere in the repository.

## Buyer journey (implemented)

1. Pick Starter/Growth/Enterprise, billing cycle and seats; enter organisation,
   workspace and administrator details; accept the legal agreements.
2. Verify the administrator email.
3. Choose **Bank transfer / Raast**. The server creates a frozen, server-priced
   invoice with a unique payment reference and due date, and the buyer is taken to
   a refreshable invoice page showing the amount, reference, due date and the
   approved account. (Bank details appear only here, only for that order.)
4. The buyer transfers the money, then optionally reports it (transaction
   reference, date, receipt PDF/PNG/JPEG). The order stays **pending
   verification**; nothing is activated.
5. An authorised operator independently confirms the credit in the bank account
   and approves with the bank's statement reference and exact amount.
6. Only then is the order confirmed, the existing provisioning workflow runs, a
   paid invoice and payment are recorded, and the buyer's page moves on to the
   workspace.

**If no approved receiving account is configured** the wizard keeps the honest
fallback — *Request bank transfer / Raast payment instructions* — which creates a
sales lead, says plainly that no payment has been processed, and never invents
instructions.

## Not done / deliberately deferred

- A tenant-side "I have paid" claim for a **renewal** invoice. Finance records the
  credit against the invoice reference from the console; the tenant sees the
  reference and bank details on their invoices page.
- Malware scanning of receipts. Receipts are type-checked by content, stored
  privately and served as forced downloads only; see ADR-0029.
- Tax-registration automation, Raast API / bank webhooks (no automated
  reconciliation — operators verify by hand), partial-payment allocation (a part
  or excess payment is never credited automatically).
- Live Safepay and live Stripe.

## Safepay go-live gates

1. Merchant due diligence approved; compliance and bank-account requirements
   confirmed.
2. Live Safepay keys and webhook secret configured securely;
   `SAFEPAY_ENVIRONMENT=production`; billing workers enabled.
3. A real low-value end-to-end charge, webhook signature and amount/currency
   check, provisioning, invoice and cancel/refund rehearsal confirmed.
4. Open-checkout lock, concurrent settlement, price differences, idempotency and
   renewals verified.
5. Approve the Safepay method for PKR in Platform Admin → Payment methods
   (environment PRODUCTION) and enable it in a controlled release. Roll back by
   suspending the method; a sandbox checkout is never presented to a real buyer.

## External dependencies before a real customer can pay

1. A legally eligible receiving bank account (and optional Raast ID) with verified
   account title, bank, IBAN, statement/maintenance documents, refund policy and
   notification address — supplied by the owner.
2. Production configuration: `SECRET_ENCRYPTION_KEY`,
   `MANAGED_BILLING_WORKER_ENABLED`, `SUBSCRIPTION_ORDER_SWEEPER_ENABLED`.
3. Operators holding `payments.verify` (finance) and a second owner to approve the
   account and method.
4. A production rehearsal with one low-value real transfer, approved and refunded.
