# Customers

> Generated from repository evidence at `ad8f77f`. Verified end to end by the
> 2026-08-15 commercial onboarding E2E.

## Purpose

`CustomerAccount` is the commercial entity a signed lead becomes. It is the
bridge between the sales funnel and the tenant that will eventually be
provisioned for it.

## Main API / services

Conversion is `convertLeadToCustomer` in
`services/api/src/modules/super-admin/`. It creates the customer, seeds a
`CustomerOnboarding`, and carries attribution forward.

## Important business rules

Verified by scenario:

- **Conversion is gated on an executed governing agreement.** No agreement, no
  customer — `LEAD_CONVERSION_BLOCKED` is emitted on refusal.
- **Attribution survives conversion.** All four fields, including
  `originatingPartnerId` and the originating lead, are retained.
- **A converted lead cannot be re-converted** — 409.
- Conversion emits `LEAD_CONVERTED`, `CUSTOMER_ONBOARDING_INITIALIZED` and a
  `PLATFORM_LEAD_CONVERTED_TO_CUSTOMER` audit row.

## Data model gaps

- **`CustomerAccount.leadId` has no unique constraint** — a plain nullable FK
  with a non-unique index — and the "already converted?" pre-check runs outside
  the conversion transaction. A concurrent double-conversion test produced one
  customer, but nothing *prevented* two. [[ITEM-0005]].
- **No origin-channel column.** `Lead.source` has no counterpart, so channel is
  reachable only by joining back through `sourceLead`, while partner attribution
  *is* denormalised. [[ITEM-0008]].

The asymmetry between those two — attribution denormalised, channel not — is
undecided rather than designed.

## Known bugs

[[BUG-0011-signed-agreement-editable-defeating-the-lead-conversion-gate]] —
VERIFIED. A customer account was created for a lead that had never had an
agreement, purely by re-pointing somebody else's executed one.

## Related

[[leads]] · [[contracts-and-agreements]] · [[customer-onboarding]] ·
[[tenant-provisioning]] · [[partners]] ·
[[commercial-onboarding-lifecycle]] · [[requirement-commercial-onboarding]]
