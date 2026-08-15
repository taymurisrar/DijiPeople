# Requirement — Lead Conversion

> **Source type: `INFERRED_FROM_IMPLEMENTATION`.** Reconstructed from
> `convertLeadToCustomer`, `assertGoverningAgreementExecuted` and the 2026-08-15
> QA run. Not product intent.

## The rule

**A lead becomes a customer only when a governing agreement for that lead has
been fully executed.**

## How the gate is actually implemented

`assertGoverningAgreementExecuted` decides by **matching contracts on
`relatedLeadId` + `contractType` + status**.

That implementation detail is the requirement's weak point, and it produced a
real bypass. Anything able to mutate those three columns can move the gate — so
the immutability of an executed agreement is not a separate nicety, it is *part
of this requirement*. When `ContractsService.update()` carried a drifted copy of
the blocked-status list, an executed agreement was re-pointed at a different
lead and that lead converted despite never having had an agreement.
[[BUG-0011]].

**A gate implemented by matching mutable columns is only as strong as the
immutability of those columns.**

## What conversion produces

- One `CustomerAccount`, carrying the originating lead and, where present,
  `originatingPartnerId` and the full attribution set.
- One `CustomerOnboarding`, seeded with a status and sub-status pair that is
  **valid against the catalogue** — the absence of that validity check made
  every converted customer's onboarding un-editable, [[BUG-0012]].
- Events: `LEAD_CONVERTED`, `CUSTOMER_ONBOARDING_INITIALIZED`, and a
  `PLATFORM_LEAD_CONVERTED_TO_CUSTOMER` audit row. A refusal emits
  `LEAD_CONVERSION_BLOCKED`.

## Idempotency

A `CONVERTED` lead is terminal and read-only; re-conversion returns 409.

**Not enforced at the data layer**, though: `CustomerAccount.leadId` has no
unique constraint and the pre-check runs outside the conversion transaction. The
concurrent test produced one customer, but nothing prevented two. [[ITEM-0005]].

## Related

[[requirement-commercial-onboarding]] · [[leads]] · [[customers]] ·
[[contracts-and-agreements]] · [[commercial-onboarding-journey]]
