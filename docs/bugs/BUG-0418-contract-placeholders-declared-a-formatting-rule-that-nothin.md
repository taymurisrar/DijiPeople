---
ID: BUG-0418
aliases: [BUG-0418]
Title: Contract placeholders declared a formatting rule that nothing applied
Status: FIXED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: fb7c771
AffectedModules: [services/api/src/modules/contracts]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-185
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/document-render-and-theme
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0418 — Contract placeholders declared a formatting rule that nothing applied

## Summary

`formattingRule` has been declared on nineteen contract placeholders since the
registry was written — `'currency'`, `'locale-date'`, `'0.##%'` — and was read
by nothing. `renderContractPlaceholders` escaped every scalar verbatim, so an
executed agreement printed "Uptime target 99.5." where it meant 99.5%, printed
an ISO timestamp where it meant a date, and printed a bare number for a price.

## Expected Behavior

A value printed into a contract is written the way a person reads it: a
percentage carries its sign, a date is unambiguous in every jurisdiction, money
carries the agreement's currency, a count is separated.

## Actual Behavior

Every scalar reached the document as stored. Only `TABLE`/`REPEATING_COLLECTION`
and `SIGNATURE`/`INITIALS` had any rendering at all.

## Reproduction

1. Open the Tenant Provisioning & Service Order template in Platform Admin.
2. Press **Preview sample data**, or generate a real agreement from it.
3. Section 6 reads "Uptime target 99.5." and section 3 shows a raw ISO date.

## Evidence

- `services/api/src/modules/contracts/contracts.service.ts` — nineteen
  `formattingRule` declarations; `grep -rn "formattingRule" services/api/src`
  returned only the type, the default, and those declarations. No reader.
- The same file's renderer ended in `return escapeHtml(value);` for every type
  outside the two handled groups.
- Reported with a screenshot of the rendered service order.

## Root Cause

`assertion-without-a-check`, in its most expensive form: the registry *declares*
the intent per placeholder, so a reviewer reading the registry sees a formatting
system. Nothing downstream consumed it, and nothing failed when it did not.

A second, independent defect is folded into this record because it produced the
same symptom on the same screen and is fixed in the same commit: the seeded
service-order template wrote `{{customer.address}}, {{customer.country}}`, and
`customer.address` is already assembled ending in the country — so every real
document printed "Dammam, Saudi Arabia, Saudi Arabia". The placeholder's example
value omitted the country too, which is what taught the template to append it.

## Impact

Every generated and **executed** agreement, not only previews. A signed PDF
carrying "99.5" where it means a service level is a commercial document that
says something other than what was agreed.

## Affected Areas

`services/api/src/modules/contracts` — the placeholder registry, the renderer,
and the seeded service-order template in `services/api/prisma/seed-config.ts`.

## Proposed Resolution

`formatPlaceholderValue`, applied by the renderer, keyed on `formattingRule`
first and the data type second. Both best-effort: a value that cannot be
interpreted is returned unchanged rather than replaced by "Invalid Date" or
"NaN%" — a contract that prints the raw string is recoverable, one that prints a
symptom of our bug is not. Remove the duplicated country from the template and
correct the address example to the full postal address the resolver builds.

## Acceptance Criteria

- A percentage prints with its sign and without trailing zeros.
- A date prints as "1 October 2026", never numerically.
- Money prints with the agreement's currency code where it has one.
- A boolean prints Yes/No; a count is thousand-separated.
- An uninterpretable value prints unchanged.
- No document line prints the same country twice.

## Regression Coverage

REG-185 — `services/api/src/modules/contracts/placeholder-formatting.spec.ts`.

## Dependencies

Existing templates hold version 1 of the seeded service order. `npm run
seed:config` refreshes it; agreements already generated keep their stored HTML,
which is correct — an executed document is immutable.

## Related Items

[[BUG-0419]] — the preview that showed this, and disagreed with it.
[[assertion-without-a-check]] — the pattern.

## Resolution

Fixed on `agent/document-render-and-theme`.

## QA Retest

Unit-verified. Not regenerated against a live database.

## History

- 2026-08-22 — reported as "Document is showing non user friendly data", with a
  screenshot of the rendered service order.
