---
ID: BUG-0316
aliases: [BUG-0316]
Title: Country industry and contact fields are free text where a canonical list exists
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: aab6965
AffectedModules: [apps/landing, apps/admin, api:lookups, packages/config]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-181
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/admin-landing-ux-program
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-21
---


# BUG-0316 — Country industry and contact fields are free text where a canonical list exists

## Summary

Country was a free-text input on the subscribe wizard and a `text` field on four
Platform Admin modules, while the API held a `Country` table of 250 ISO rows —
and `apps/admin` and `apps/landing` each carried a *third* and *fourth*
hardcoded list. Email, phone and URL columns rendered as plain text boxes
throughout, because Prisma has one string type and nothing inferred the rest.

## Expected Behavior

A field whose values come from a known list is chosen from that list, and there
is one list.

## Actual Behavior

"UAE", "U.A.E." and "United Arab Emirates" are three customers as far as any
report is concerned. `workEmail` had no email keyboard or validation;
`stripeHostedInvoiceUrl` was an uneditable-looking string rather than a link.

## Reproduction

1. Open the subscribe wizard: Country is a text input.
2. Open a customer in Platform Admin: Country is a text input; Work email is a
   text input.
3. `SELECT count(*) FROM "Country"` returns 250.

## Evidence

- `apps/landing/app/subscribe/onboarding-steps.tsx` — `country` as `<input>`.
- `apps/admin/lib/runtime/platform-module-registry.ts` — `field("country",
  "Country", "text", …)` in three places.
- `apps/admin/lib/reference-data/platform-reference-data.ts` `PLATFORM_COUNTRIES`
  and `apps/landing/lib/acquisition-options.ts` `COUNTRY_OPTIONS` — the two
  hardcoded copies.
- `services/api/src/modules/lookups/geographic-lookup.service.ts` — the real
  list, refreshed from an ISO source.
- 39 fields across six modules had a control type that did not match the column.

## Root Cause

Two separate causes with one symptom. The generated runtime manifest derived its
control from the Prisma type alone, and Prisma has one string type — so every
email, phone and URL became `text`. And the geographic lookup was behind
`JwtAuthGuard`, so the unauthenticated wizard could not reach it, which is why a
hardcoded list appeared beside it rather than instead of it.

## Impact

Data quality on every commercial record, and a measurably worse form on mobile,
where the keyboard is chosen by the input type.

## Affected Areas

The subscribe wizard, every Platform Admin record form, `lookups`.

## Proposed Resolution

Infer the control from the column name in the generator, so every module gains
it at once rather than four being patched. Add a public, rate-limited
`public/geography` projection so the wizard and admin read the same list. Point
the declared country fields at it.

## Acceptance Criteria

- Country is a lookup in admin and a select on the landing wizard.
- Email, phone and URL columns render with the matching control.
- The country list has exactly one source.
- A lookup failure degrades the wizard to a text input rather than blocking
  checkout.

## Regression Coverage

REG-181 — the freshness check added for [[BUG-0282]] fails when the manifest
stops matching the schema, which now includes the inferred controls. The
inference rules are deliberately narrow suffixes, so `emailStatus` stays a
status and `taxRatePercent` stays a decimal.

## Dependencies

None.

## Related Items

[[BUG-0282]] — the manifest that made these controls invisible to review.
[[ITEM-0075]] — `companySize`, still not collected.

## Resolution

Fixed on `agent/admin-landing-ux-program`. 39 control types corrected by one
change to the generator.

## QA Retest

Not opened in a browser; the control types are asserted through the manifest.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-181 names `scripts/generate-platform-runtime-schema.mjs`, `npm run check:runtime-schema`, and that is what was executed.

```text
node <script>   PASS
npm run check:runtime-schema   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-21 — reported as "check each field in landing page and admin page,
  they should use the corrected data field type like country should be lookup".
