---
ID: ITEM-0021
Title: Mechanical guard against country and currency literals in frontends
Type: TEST_GAP
Status: READY
Priority: P2
Severity: LOW
AffectedModules: [scripts, apps/landing, apps/web, apps/admin]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DEFER
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
RelatedBug: BUG-0028
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0021 — Mechanical guard against country and currency literals in frontends

## Summary

[[BUG-0028]] was a country-to-currency lookup table compiled into the landing
bundle. It is deleted, and a comment at the site says not to bring it back — but
a comment is not a gate. Nothing mechanically stops the next person adding
`if (country === "AE") return "AED"` to a component.

## Why It Matters

Low severity, real failure mode. This is the same shape as the loopback-URL
defect: a decision that belongs in configuration, inlined into a shipped bundle
where it cannot be audited or changed without a deploy. That one got a
mechanical guard (`scripts/check-no-hardcoded-urls.mjs`) precisely because a
convention did not hold. The argument applies identically here.

## Evidence

- `apps/landing/lib/plans.ts` — the deleted `detectRegionCurrency` and
  `europeanCountries` set, replaced by a comment.
- `scripts/check-no-hardcoded-urls.mjs` — the working precedent, with a reasoned
  allowlist and CI wiring.

## Proposed Approach

Extend the existing script rather than adding a second one. Detect ISO-4217
currency-code literals and ISO-3166 country-code comparisons in frontend
`app/` and `lib/` sources, with an allowlist for legitimate uses — currency
*formatting* takes a code as data, and a country **select** legitimately holds a
list of countries. The distinction is between listing countries and *deciding*
something from one.

Worth confirming the false-positive rate before wiring it into the required CI
gate; a noisy check trains people to ignore it.

## Acceptance Criteria

- Reintroducing a country-to-currency branch in a frontend fails the check.
- A currency-formatting call and a country picker do not.
- The check runs in CI alongside `check:no-hardcoded-urls`.

## Dependencies

None.

## Related Items

[[BUG-0028]] · [[BUG-0026]] · `silent-config-fallback` bug pattern.

## History

- 2026-08-16 — created during Wave 1 after deleting the hardcoded mapping.
