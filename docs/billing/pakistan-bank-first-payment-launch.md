# Pakistan payment launch — bank-first interim path

Updated: 2026-11-04. This is an interim workflow, **not** automated bank-transfer collection or automated invoice settlement.

## Decision
- Keep only the predefined Starter, Growth and Enterprise catalogue plans; custom plans remain explicitly configured per customer.
- Safepay is integrated in sandbox and merchant approval is pending. Do not enable its production routing until merchant approval, production credentials, verified webhook signature and a complete real-payment rehearsal.
- Stripe test-mode integration remains for development. Do not present Stripe sandbox as an available paid method in production; do not delete the Stripe code.
- For published PKR plan prices on the public subscription wizard, present “Request bank transfer / Raast payment instructions” even when live gateways are unavailable.
- Do not show bank account details in public until the applicant confirms an account permitted for commercial collections.

## Interim buyer journey (implemented in this branch)
1. Customer selects a published PKR price for Starter/Growth/Enterprise and an employee-seat quantity.
2. Customer enters organization, workspace, owner and applicable legal-acceptance details.
3. Customer selects the bank-transfer request option on the subscription wizard and submits.
4. The landing site sends a PRICING inquiry through the existing rate-limited `POST /public/leads` path, retaining the plan key, price ID, seat quantity, billing interval, currency, workspace request, referral code and existing attribution.
5. The buyer receives an on-page acknowledgement clearly stating that **no payment has been processed and no subscription is active**.
6. Platform sales/admin receives the lead via the existing lead operations process and follows up to verify eligibility, price, tax treatment, account identity, invoice, payment instructions and approval.

## Operator checklist
- Confirm that the receiving bank account is acceptable to the bank and to the merchant's tax/legal setup. Do not publish a personal account by default.
- Validate the plan, active publication, PKR market/currency, plan price, employee seats, billing interval, discounts and applicable tax using authoritative server-side commercial data. A client's message is a request, not a price source.
- Generate the invoice using the platform's supported sales-assisted workflow. Confirm invoice number, legal merchant identity, due date, payment reference and bank details before sending.
- Confirm incoming funds independently using bank records and check amount, currency, reference, payer and invoice allocation. A screenshot or transaction ID is **not sufficient**.
- Only after proof is verified should a privileged admin record settlement and use approved customer-onboarding/provisioning workflows. Never call `OrderActivationService.confirmPayment` from an unauthenticated request or accept a browser success flag as money.
- Record verification actor, date/time, bank confirmation evidence reference, invoice and subscription IDs, and relevant audit events; preserve idempotency if the evidence is resubmitted.
- Reconcile refunds, overpayments, underpayments, cancelled orders and abandoned draft workspace reservations.

## What is deliberately NOT implemented in this interim branch
- A public bank account/card-number form, automated Raast gateway, bank webhook or receipt upload.
- An order-level manual-bank payment record with pending/verified/rejected/reconciled state.
- Automatic admin invoice generation for the public bank inquiry.
- Admin approval queue and automatic provisioning from a bank-transfer receipt.
- Production Safepay activation or Stripe activation.

## Phase 2 — full bank-transfer order settlement (required for end-to-end self-service)
Model a secure manual-payment instruction and settlement lifecycle tied to the existing SubscriptionOrder, with server-owned amount/currency/snapshot, unique bank reference, safe expiry, evidence storage, privileged admin verification and rejection, invoice issuance and audit, and idempotent outbox provisioning **only after settlement**. Reuse OrderActivationService only with a verified server-side settlement record. Implement renewals, plan changes, refunds, cancellation and failure recovery. Add operator queues and notifications. Enforce tenant isolation and platform permissions, and block double payment at provider cut-over.

## Safepay go-live gates
1. Merchant due diligence approved; compliance and bank-account requirements confirmed.
2. Live Safepay keys + endpoint webhook secret configured securely; `SAFEPAY_ENVIRONMENT=production`; correct workers enabled.
3. Real low-value end-to-end charge, webhook signature and amount/currency check, order provisioning, invoice and cancellation/refund rehearsal confirmed.
4. Verify old Stripe/Safepay open-checkout lock behavior, concurrent settlement, price differences, idempotency, and customer-visible renewals.
5. Enable only the approved production payment method in a controlled release. Roll back routing safely without ever presenting sandbox checkout to real customers.

## Verification requirements
Run landing lint/typecheck/tests/build, API tests/typecheck, billing integration tests, E2E signup and plan-price-market checks, and production read-only verification before release. This branch has not been compiled or E2E tested by the initiating GitHub connector session; require CI evidence and review before merge.
