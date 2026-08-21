---
ID: BUG-0351
aliases: [BUG-0351]
Title: The subscribe wizard progress rail truncated every step label
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: 0d10a9d
AffectedModules: [apps/landing]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-182
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/ux-round-two
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-21
ResolvedAt: 2026-08-21
---

# BUG-0351 — The subscribe wizard progress rail truncated every step label

## Summary

The stepper introduced for [[BUG-0317]] laid five labelled steps across a single
row, each label beside its marker with `truncate`. At the width the wizard
actually renders at, four of the five labels were clipped: "Your org…", "Your
wo…", "Worksp…", "Agreem…". A regression introduced by the fix for the previous
defect on the same component.

## Expected Behavior

A progress rail names its steps. Position, length and which step is current are
all legible at the width the form is used at.

## Actual Behavior

Four truncated fragments and one intact word. The rail told a buyer less than
the numbers beside it did.

## Reproduction

Open `/subscribe` at any ordinary desktop width and read the step rail.

## Evidence

- `apps/landing/app/subscribe/subscribe-form.tsx` (before) — `<li className="flex
  flex-1 items-center gap-2">` wrapping a button whose label span carried
  `truncate`.
- `apps/landing/lib/onboarding-wizard.ts` — `STEP_TITLES` values of "Your
  organization" (17), "Your workspace" (14) and "Workspace administrator" (23).

## Root Cause

Two things at once, and only together do they truncate.

The layout put five horizontal label-beside-marker units into one row, so each
label got roughly a fifth of the column minus the marker. And the rail reused
`STEP_TITLES`, which are *headings* — a heading owns a whole column and can
afford "Workspace administrator"; a rail label cannot.

`truncate` then made the failure quiet. Text that overflows visibly is a bug
somebody notices in review; text that ellipsizes looks deliberate.

## Impact

Every buyer, on the highest-stakes form the product has. Shipped as part of a
change whose stated purpose was making that form clearer.

## Affected Areas

`apps/landing` — the stepper in `app/subscribe/subscribe-form.tsx` and the label
constants in `lib/onboarding-wizard.ts`.

## Proposed Resolution

Stack the label beneath its marker so each one owns the full width of its
segment, and introduce `STEP_LABELS` — one or two words per step — separate from
the headings. Keep the three states distinguishable without colour (tick,
filled, outlined) and keep the written "Step N of 5".

## Acceptance Criteria

- No step label is clipped at any width the form supports.
- Rail labels are distinct from one another.
- Completed steps remain reachable, and the current step is identifiable without
  relying on colour.

## Regression Coverage

REG-182 — `apps/landing/lib/onboarding-wizard.spec.ts` asserts every step has a
rail label, that none exceeds the width one segment holds, and that no two are
the same word.

## Dependencies

None.

## Related Items

[[BUG-0317]] — the change this regressed.
[[BUG-0350]] — reported in the same message, on the same form.

## Resolution

Fixed on `agent/ux-round-two`. Labels moved beneath their markers; `STEP_LABELS`
added alongside `STEP_TITLES` with a comment stating why both exist.

## QA Retest

Not opened in a browser. Label length is asserted; rendered layout is not.

## History

- 2026-08-21 — reported as "what the hell you did with multi steps?", with a
  screenshot of the truncated rail.
