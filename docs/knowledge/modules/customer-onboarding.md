# Customer Onboarding

> Generated from repository evidence at `ad8f77f`. Verified by the 2026-08-15
> commercial onboarding E2E.

## Purpose

The stage between "a customer signed" and "a tenant exists". Tracks kickoff,
readiness conditions, and the point at which provisioning may begin.

## Main API / services

`services/api/src/modules/super-admin/` —
`PATCH /super-admin/customer-onboarding/:id`,
`updateCustomerOnboarding`, and `CUSTOMER_ONBOARDING_SUB_STATUS_OPTIONS` as the
status/sub-status catalogue.

Seeded automatically by `convertLeadToCustomer` — see [[customers]].

## Important business rules

- **Status and sub-status are paired.** `updateCustomerOnboarding` validates the
  effective sub-status against the catalogue on **every** call, not only when
  the status changes.
- **Readiness flips to ready only when every condition is met**, and
  provisioning is refused while it does not — with the blockers listed. A
  blocked provisioning attempt leaves **no partial `Tenant`** behind, which was
  verified explicitly.

## Known bugs

[[BUG-0012-onboarding-created-by-lead-conversion-was-born-uneditable]] —
VERIFIED, HIGH.

The seed wrote `status: NOT_STARTED` with `subStatus: 'Agreement executed'`, a
pair absent from the catalogue. Because the validator runs on every call, **every
onboarding created by conversion was un-editable from birth** — a notes-only
PATCH returned 400, and the only escape was to guess that a status change had to
be sent in the same request.

This blocked the primary commercial journey at the first step after conversion,
for every customer. The generalisable lesson: **a writer and a validator that
read the same catalogue must both actually consult it.** Pattern:
[[unvalidated-seed-state]].

## Open backlog

[[BUG-0024-start-onboarding-api-and-proxy-have-no-caller]] — the admin action
navigates to `/onboarding/new` and never calls the endpoint built for it.

## Regressions

REG-010 — `platform-lifecycle.onboarding-seed.spec.ts`, which additionally
asserts that **every** `CustomerOnboardingStatus` has a valid default
sub-status.

## Related

[[customers]] · [[leads]] · [[tenant-provisioning]] ·
[[commercial-onboarding-lifecycle]] · [[requirement-commercial-onboarding]]
