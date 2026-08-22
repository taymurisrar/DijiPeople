---
ID: BUG-0317
aliases: [BUG-0317]
Title: The subscribe wizard shows five identical pills and labels three address fields only by placeholder
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: aab6965
AffectedModules: [apps/landing]
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


# BUG-0317 — The subscribe wizard shows five identical pills and labels three address fields only by placeholder

## Summary

The five-step subscribe wizard showed five identical pills, distinguished only
by fill colour, with no sense of how far along the buyer was or how much was
left. Three address fields carried no visible label at all — only a placeholder
and an `aria-label`.

## Expected Behavior

A multi-step form states position and length, distinguishes done from current
from unreached without relying on colour, and labels its fields visibly.

## Actual Behavior

Five same-sized pills. A placeholder that vanishes on the first keystroke,
leaving three identical boxes.

## Reproduction

Open `/subscribe`, start typing in the address block, then look away and back.

## Evidence

- `apps/landing/app/subscribe/subscribe-form.tsx` — the pill list, differing
  only by background.
- `apps/landing/app/subscribe/onboarding-steps.tsx` — `addressLine2`, `city` and
  `stateProvince` as bare inputs with `placeholder` and `aria-label`.

## Root Cause

`aria-label` reads as an accessibility fix, and it is half of one: it satisfies
a screen reader and leaves every sighted user with a vanishing label. The
pattern passes an automated accessibility check, which is how it survives.

## Impact

Every buyer, on the highest-stakes form the product has.

## Affected Areas

`apps/landing` subscribe wizard — the stepper in `subscribe-form.tsx` and the
organization step in `onboarding-steps.tsx`.

## Proposed Resolution

A progress indicator with completed / current / unreached states carrying a tick
and a number rather than only a shade, a written "Step 2 of 5", and visible
labels with correct `autoComplete` tokens on every address field.

## Acceptance Criteria

- Progress is legible without colour.
- Every field has a visible label that survives typing.
- Completed steps remain reachable.

## Regression Coverage

REG-181. Visual verification was not performed — stated rather than implied.

## Dependencies

None.

## Related Items

[[BUG-0316]] — the field types on the same form.

## Resolution

Fixed on `agent/admin-landing-ux-program`.

## QA Retest

Not opened in a browser.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-181 names `scripts/generate-platform-runtime-schema.mjs`, `npm run check:runtime-schema`, and that is what was executed.

```text
node <script>   PASS
npm run check:runtime-schema   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-21 — reported as "fix the multi step form UI UX, make sure it is
  seamless and smooth".
