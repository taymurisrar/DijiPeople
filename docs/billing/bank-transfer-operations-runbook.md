# Bank-transfer payments — operations runbook

Audience: DijiPeople platform operators (finance, support) and the engineer
releasing the feature. Architecture and rationale: ADR-0029 and
`docs/architecture/payment-methods-and-bank-transfer.md`.

## Roles and permissions

| Action | Permission | Held by |
|---|---|---|
| View the verification queue, claims, renewal invoices, methods | `payments.read` / `billing.read` | finance, billing, admin roles |
| Add a payment method / receiving account (draft) | `billing.manage` | PLATFORM_ADMIN, FINANCE_MANAGER |
| Approve or enable a method; approve, reject, suspend, activate a receiving account | `platform.billing.administer` | SUPER_ADMIN only |
| Approve, reject, ask the customer, mark duplicate; record a renewal payment | `payments.verify` | SUPER_ADMIN, PLATFORM_ADMIN, FINANCE_MANAGER |
| Refund a bank payment | `platform.billing.administer` | SUPER_ADMIN only |

A receiving account **cannot be approved by the operator who entered it.**

## One-off setup (per market and currency)

Owner input required — none of this can be determined from the repository:

1. A bank account (and optionally a Raast ID) that DijiPeople is **legally
   permitted to use for merchant receipts**, with its exact account title, IBAN
   and bank name, statement/maintenance documentation, refund policy and the
   notification address to publish. Do not use a personal account by default.
2. `SECRET_ENCRYPTION_KEY` set on the API (production-mandatory). Without it the
   console refuses to store an account and the checkout refuses to offer a
   transfer. Rotating it makes stored accounts and references undecryptable —
   do not rotate without a re-encryption plan.
3. `MANAGED_BILLING_WORKER_ENABLED=true` so renewal invoices are issued, grace
   and expiry are applied and reminders are sent; and
   `SUBSCRIPTION_ORDER_SWEEPER_ENABLED=true` so unpaid orders and stale claims
   age out.

Then, in Platform Admin → Billing → **Payment methods**:

1. *Add payment method*: market = Pakistan, currency = PKR, method = Bank
   transfer / Raast. It is created **disabled and unapproved**.
2. *Receiving accounts → Add account* (operator A). Identifiers are stored
   encrypted and shown masked.
3. A different operator B (`platform.billing.administer`) **approves** the
   account, then **makes it active**.
4. B **approves** the method, then **enables** it. Enabling is refused until the
   readiness list is green (approved, valid environment, active approved account,
   encryption configured).
5. Verify on the landing site that a PKR price now offers *Bank transfer / Raast*
   and that a USD price does not.

To withdraw the method instantly: *Suspend* it (or disable it). New checkouts stop
immediately; invoices already issued keep the account they were told about.

## Daily verification (first purchase)

Billing → **Bank transfers**. Each row is a customer's *claim*.

1. Open the claim. Read the warnings (duplicate customer reference, claimed ≠
   invoice amount, order no longer payable).
2. **Look in the receiving bank account.** Find the credit by the payment
   reference (`DP-XXXX-XXXX`) and amount. A receipt, screenshot or the customer's
   transaction id is **not** proof.
3. Download evidence only to a sandboxed viewer. It is unscanned.
4. Choose one:
   - **Approve** — enter the bank's own statement reference and the amount
     received, tick the attestation. The amount must equal the invoice exactly. On
     success the order is confirmed and provisioning starts; the customer's invoice
     page changes to *Payment confirmed*.
   - **Ask customer** — emails the question; the customer can submit again.
   - **Reject** — emails the reason. The order stays payable until it expires.
   - **Mark duplicate**.
5. Errors you may see on Approve and what they mean:

| Code | Meaning | Do |
|---|---|---|
| `PAYMENT_UNDERPAID` / `PAYMENT_OVERPAID` / `PAYMENT_CURRENCY_MISMATCH` | Amount ≠ invoice | Do not approve. Ask the customer; refund an excess manually |
| `DUPLICATE_BANK_REFERENCE` | That statement reference already settled something | Check you are not recording one credit twice |
| `ORDER_NOT_PAYABLE` | Order expired, cancelled or already paid | Reject; refund the money if received |
| `CLAIM_ALREADY_DECIDED` | Another operator decided first | Refresh |

Approving twice is safe: the second request only re-attempts the (idempotent)
confirmation.

## Renewals

Bank-paid subscriptions renew like other managed ones: an invoice with its own
payment reference is issued ahead of the period end (default notice period), the
payer is reminded when issued, 3 days before due and when overdue, and the
subscription moves to PAST_DUE then ends after the grace period.

When money arrives: Billing → Bank transfers → **Renewal invoices awaiting
payment** → *Record payment* (statement reference, exact amount, attestation). The
invoice is paid and the next period applied in one transaction. The tenant sees
the reference and bank details on their invoices page.

## Refunds and cancellations

- **Refund a bank payment**: return the money from the bank account first, then
  Billing → Safepay/Provider payments tab → the payment → *Refund* with the bank's
  reference for the transfer you made. DijiPeople cannot move the money.
- **Customer cancels an unclaimed invoice** from the invoice page (frees them to
  choose another method). Once a payment has been reported only an operator can
  resolve it.
- **Tenant cancels renewal / resumes**: existing cancel-at-period-end and resume
  actions apply to bank-paid subscriptions.
- **Expiry**: an unpaid invoice expires after 7 days; a claim nobody decides is
  expired 7 days after that. An order with an open claim is never aged out while a
  person may still be verifying funds.

## Go-live checklist (nothing here is automatic)

- [ ] Receiving account approved by the owner, entered by A, approved by B.
- [ ] `SECRET_ENCRYPTION_KEY`, `MANAGED_BILLING_WORKER_ENABLED`,
      `SUBSCRIPTION_ORDER_SWEEPER_ENABLED` set; commit hash at `/api/health`
      matches the release.
- [ ] Migration `20261112090000_payment_methods_and_bank_transfer` applied (the
      deploy pre-command runs `migrate deploy`). It is additive.
- [ ] Rehearse with one low-value real transfer end to end and refund it.
- [ ] Safepay stays **off** in production until merchant approval (see
      `safepay.md`); Stripe stays hidden until live-ready.
- [ ] Finance staff hold `payments.verify`; only owners hold
      `platform.billing.administer`.
- [ ] Decide whether to add a malware scanner before enabling receipts in
      production (see ADR-0029 consequences).
