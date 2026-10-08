---
ID: ADR-0026
aliases: [ADR-0026]
Title: Partner status is action-driven, commission is a snapshotted percentage, and currency comes from an enabled platform subset
Status: ACCEPTED
CreatedAt: 2026-10-07
UpdatedAt: 2026-10-07
---
# ADR-0026 — Partner status is action-driven, commission is a snapshotted percentage, and currency comes from an enabled platform subset

## Status

Accepted — 2026-10-07. The owner's brief for [[TASK-0037-partner-module-completion-delete-numbering-status-lifecycle-]]
asked for these decisions to be made from the existing domain model rather than
invented. Plan: EXECPLAN-0055.

## Context

- **Status.** Partners carry two status fields:
  - `PartnerStatus`, 24 values covering both the inquiry flow and the console
    flow;
  - `PartnerAccountStatus` (NOT_PROVISIONED, INVITED, ACTIVE, SUSPENDED,
    DISABLED), which records portal access.
- **Status today.**
  - Lifecycle actions guard some transitions.
  - Create accepts any status.
  - The header status control fails.
  - Inquiry qualification and rejection can demote an ACTIVE partner.
- **Commission.** The default rate is already stored as a 0–100 percentage
  (Decimal(5,2)). Agreements read it at render time, so editing the partner
  silently changes unsigned agreements.
- **Commission records.** Commissions are created only by hand.
- **Currency.** Currencies come from the compile-time `PLATFORM_CURRENCIES`
  catalog. There is no operator-controlled subset.

## Decision

1. **No new statuses.**
   - The record shows three things:
     - a derived **Status** phase: Prospect, Onboarding, Active, Suspended or Closed;
     - **Sub-status**, which is the exact `PartnerStatus`;
     - **Account**, which is `PartnerAccountStatus`.
   - The phase mapping lives in one shared module, used by both the API and
     the admin app.
   - Status changes only through lifecycle actions that the server validates.
   - Create always starts at DRAFT, and update never accepts `status`.
   - Inquiry qualification and rejection refuse partners that are already
     ACTIVE, SUSPENDED or TERMINATED.
2. **Account status is system-controlled.**
   - Activation sets it to INVITED.
   - Activating a portal user sets it to ACTIVE.
   - Suspend sets it to SUSPENDED, and deactivate or terminate sets it to
     DISABLED.
   - The edit form shows it read-only, with an explanation of which action
     changes it.
3. **Commission percentages.**
   - Canonical form: a percentage from 0 to 100 with two decimals, stored as
     Decimal(5,2).
   - Display uses `n%`.
   - Calculation is `amount × rate / 100`, computed on the server.
   - A new agreement snapshots the partner default into its own
     `commissionPercentage` when it is created.
   - An explicit agreement rate is never overwritten.
4. **Commission records.**
   - Commissions remain operator-created ledger entries, added with Add
     Commission from the partner.
   - The status machine is PENDING → APPROVED → PAYABLE → PAID. VOID is allowed
     from any state except PAID.
   - Linked lead, customer and invoice records must belong to the partner.
   - Automatic accrual from payments is not built, because the billing model
     has no commission hook. It is recorded as a backlog item rather than
     invented here.
5. **Currency.**
   - `platform-defaults.enabledCurrencies` is a subset of
     `PLATFORM_CURRENCIES`. It defaults to the full catalog.
   - One platform endpoint serves it.
   - Partner, contract and commission currency fields use it.
   - A record whose currency is later disabled still shows its value.

## Reasons

- Reusing the existing enums avoids a data migration and keeps both partner
  flows readable.
- A snapshot is the only way an agreement can stay what was agreed.
- An enabled subset of the one catalog avoids a second currency source.

## Alternatives Considered

- **Unlocking the status field.** Rejected, because it would bypass every
  lifecycle guard.
- **Storing commission as a fraction (0.10).** Rejected: every existing
  column, DTO and placeholder already uses 0–100.
- **Generating commissions from invoice payments.** Rejected for now. There is
  no source of commissionable amounts, so it would fabricate financial
  behaviour.
