# Leads

> Generated from repository evidence at `ad8f77f`. Verified end to end by the
> 2026-08-15 commercial onboarding E2E.

## Purpose

The entry point of the commercial funnel. A lead arrives from the public website
or a partner referral, is qualified, and converts to a `CustomerAccount`.

## Frontend surfaces

Two public forms in `apps/landing` — `/request-demo` and `/contact` — plus the
admin lead list and record. `/request-demo` carries a honeypot; `/contact` does
not.

## Main API / services

`services/api/src/modules/leads/`, including `PublicLeadsController`
(`@Public()`). Conversion lives in `super-admin`
(`convertLeadToCustomer`) — see [[customers]].

## Important business rules

Verified by scenario, 2026-08-15:

- **Server-owned fields on public submission**: `source='Website'`,
  `status='NEW'`, `attributionStatus='DIRECT'`. A client cannot inject
  `tenantId` or `status` — `forbidNonWhitelisted` returns 400.
- **Honeypot submissions are silently dropped** — no row, no id leaked.
- **A referral code resolves to the partner and sets `ATTRIBUTED`**; an invalid
  code is recorded as `INVALID_CODE` with the code retained and the partner
  left null. It is never silently attributed.
- **A public submitter cannot set `partnerId` directly.**
- **A `CONVERTED` lead is terminal and read-only**; re-conversion returns 409.
- **Conversion requires an executed governing agreement.** The gate matches
  contracts on `relatedLeadId` + `contractType` + status — so anything able to
  mutate those columns moves the gate. See
  [[BUG-0011-signed-agreement-editable-defeating-the-lead-conversion-gate]].
- Each accepted public submission emails every active platform user in the sales
  and admin roles — which made the missing rate limit an **outbound email
  amplifier**, not only a row-growth vector.

## Known bugs

- [[BUG-0013-public-lead-endpoint-had-no-rate-limiting]] — VERIFIED.
- [[BUG-0021-landing-contact-form-fabricates-lead-data]] — OPEN. `/contact`
  invents `industry`, `companySize` and `lastName`, and has no honeypot.
- [[BUG-0018-bulk-lead-delete-is-unreachable-for-every-role]] — DEFERRED. Fails
  closed.

## Open backlog

[[ITEM-0007]] — should duplicate website leads be deduplicated? The partner
inquiry endpoint does; this one does not, and nobody wrote down which was
intended.
[[ITEM-0013]] — a mechanical check that every `@Public()` controller is rate
limited.

## Regressions

REG-011 — `public-leads.rate-limit.spec.ts`.

## Related

[[customers]] · [[partners]] · [[contracts-and-agreements]] ·
[[commercial-onboarding-lifecycle]] · [[requirement-lead-conversion]] ·
[[authentication]]
