---
ID: ITEM-0054
aliases: [ITEM-0054]
Title: Contract placeholder examples fabricate a Saudi legal entity, CR number and tax ID
Type: DOCUMENTATION
Status: DEFERRED
Priority: P2
Severity: MEDIUM
AffectedModules: [contracts]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DEFER
CreatedAt: 2026-08-18
UpdatedAt: 2026-08-18
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation: TASK-0007
TargetMilestone: 
BlockedBy: OD-02 — legal operator identity
---

# ITEM-0054 — Contract placeholder examples fabricate a Saudi legal entity, CR number and tax ID

## Summary

`services/api/src/modules/contracts/contracts.service.ts` defines the contract
placeholder catalogue. Several platform-identity placeholders carry
`exampleValue`s that are invented legal facts:

| Placeholder | Fabricated example |
|---|---|
| `platform.registrationNumber` | `CR-1010203040` |
| `platform.taxId` | `310000000000003` |
| `platform.address` | `Riyadh, Saudi Arabia` |
| `platform.reportingCurrency` | `SAR` |
| `platform.authorizedSigner.name` | a real person's name |

TASK-0007's brief is explicit that the platform must not fabricate a legal
entity name, registration number, registered office, tax number, or a Saudi
entity. These values do exactly that.

## Why this is P2 and not a bug

**The generation path fails closed, so no contract can be produced carrying
them.** `placeholder()` sets `defaultValue: null` and `fallbackBehavior: 'ERROR'`
for every non-signature key, so an unresolved platform identity raises rather
than substituting the example. Verified by reading
`contracts.service.ts:229-252`.

The risk is presentational, not transactional: an operator reading the
placeholder catalogue or a preview in Admin sees a plausible CR number and tax
ID and may reasonably conclude the platform has a registered Saudi entity. It
does not — see OD-02, which records that no registered entity exists anywhere in
this repository.

The market catalogue reinforces the point: Pakistan is the launch market, and
`Market.taxProfileRef` is nullable precisely so a market without a registration
cannot claim one. A Saudi example contradicts both.

## Proposed resolution

Replace the fabricated examples with obviously-not-real placeholders — the
convention the rest of this repository already uses for unknowable values:

- `platform.registrationNumber` → `<registration-number>`
- `platform.taxId` → `<tax-id>`
- `platform.address` → `<registered-office-address>`
- `platform.authorizedSigner.name` → `<authorized-signer>`
- `platform.reportingCurrency` → leave unset, or `PKR` to match the launch market

An example that cannot be mistaken for a fact is strictly better here than a
realistic one, because the only thing the example teaches is the shape.

## Acceptance criteria

1. No placeholder example contains a registration number, tax identifier or
   registered office that could be read as a real one.
2. The generation path still fails closed on an unresolved platform identity.
3. `contracts.domain.spec.ts` is updated in step; it currently asserts on the
   fabricated signer name.

## Dependencies

Deliberately **not** blocked on OD-02. Removing fabricated values does not
require knowing the real ones — that is the point. OD-02 is what supplies the
real values later.

## Related Items

[[TASK-0007]] — the contracts module has no knowledge note yet

## History

- 2026-08-18 — found while auditing WP-12 for hardcoded contact identities. Recorded rather than fixed in-flight: `contracts.service.ts` is a 5,700-line catalogue outside this task's scope, and changing signatory examples deserves its own review.
