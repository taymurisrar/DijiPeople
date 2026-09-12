---
ID: BUG-3412
aliases: [BUG-3412]
Title: Every widget section on a record form prints its title twice, and the profile section's two titles disagree
Status: FIXED
Severity: LOW
Priority: P3
Type: UX
Source: USER_REPORT
DetectedDate: 2026-09-12
DetectedInSha: 06ed3592
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-416
RelatedBacklogItem: ITEM-0167
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-12
UpdatedAt: 2026-09-12
ResolvedAt: 2026-09-12
---

# BUG-3412 — Every widget section on a record form prints its title twice, and the profile section's two titles disagree

## Summary

On the employee record, three sections show their heading twice in a row. The
metadata form renders a section heading, and the widget hosted inside that
section renders its own heading, so the reader sees "Timeline" above
"Timeline" and "Reporting Hierarchy" above "Reporting Hierarchy".

The profile section has the same duplication with an extra wrinkle: the two
headings do not match. The section says **Profile Image** and the widget inside
says **PROFILE PHOTO**, so one control is announced under two different names.

The section metadata already has a `labelVisible` flag intended for exactly
this, and the renderer honours it in only one of its several paths.

## Expected Behavior

A section that hosts a self-titling widget shows the title once. Where a
section and its widget both have a name, one of them wins and the other is
suppressed. A single control has a single name.

## Actual Behavior

Both headings render. Every widget-hosting section on the employee record is
affected, and the profile pair uses two different words for the same thing.

## Reproduction

1. Open an employee record in the tenant product, for example
   `/employees/{employeeId}`.
2. Scroll to the Timeline, Reporting Hierarchy and Profile Image sections.
3. Each shows its heading, then immediately shows a heading again.

## Evidence

Measured on the live employee record at `06ed3592`, counting only headings with
a non-zero bounding box, so nothing here is the hidden measurement copy from
[[BUG-3378]]:

| Heading | Occurrences | Tags | One nested inside the other |
|---|---|---|---|
| Timeline | 2 | `h4`, `h4` | yes |
| Reporting Hierarchy | 2 | `h4`, `h4` | yes |

and, for the profile control, two visible `h4` headings that differ:
`"Profile Image"` and `"PROFILE PHOTO"`.

Twenty visible headings on the page in total, so three of them are redundant.

Code:

- `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx:856-858`
  — the main section renderer emits `h4` with `section.label`
  **unconditionally**. This is the outer heading in every pair above.
- `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx:837-840`
  — the custom-content branch is slightly better, guarding on
  `section.label ?`, but still never consults `labelVisible`.
- `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx:194` —
  the **only** place in the file that honours `section.labelVisible !== false`.
  Grepping the file for `labelVisible` returns exactly this one line.
- The inner heading comes from the widget itself, rendered through
  `apps/web/app/components/runtime/module-widget-renderer.tsx`, where each
  widget draws its own header.

So the flag that would fix this exists, is respected in one render path, and is
ignored in the path that actually produces the employee record.

## Root Cause

Two components each believe they own the section title, and the metadata flag
that would arbitrate between them is only read by one of the renderer's several
branches.

## Impact

Cosmetic, and small. It matters mainly because it is systemic rather than
one-off — it affects every widget-hosting section on every runtime record page,
and the employee record is the layout [[ITEM-0167]] proposes copying to the
remaining bespoke record pages. Duplicated headings also add noise for screen
reader users navigating by heading.

The mismatched profile pair is the one part with a real cost: two names for one
control is a genuine ambiguity rather than mere repetition.

## Affected Areas

`runtime-metadata-form-renderer.tsx` section rendering, and therefore every
record page rendered through `ModuleRecordPage` that hosts a widget in a
section. Observed on the employee record; the same pair of components serves
the others.

## Proposed Resolution

Honour `section.labelVisible` in the two branches at `:837` and `:856` that
currently ignore it, then set it false for sections whose only content is a
self-titling widget. Alternatively, have widgets skip their own header when
they are rendered inside a titled section — either direction works, but it
should be one rule applied everywhere rather than a per-section fix.

Settle the profile naming while there: pick **Profile Image** or **Profile
Photo** and use it in both the section metadata and the widget.

No ExecPlan needed.

## Acceptance Criteria

- No visible heading text appears twice in a row on a runtime record page.
- `section.labelVisible === false` suppresses the section heading in every
  render path in `runtime-metadata-form-renderer.tsx`, not just one.
- The profile control has one name, used by both the section and the widget.
- The employee record's visible heading count drops by three, with no section
  losing its only title.

## Regression Coverage

Needs a test rendering a record form with a widget-hosting section and
asserting the section title appears once. A register entry follows once
written.

## Dependencies

None. Should land before [[ITEM-0167]] spreads this shell further, alongside
[[BUG-3378]].

## Related Items

[[BUG-3378]] is the other defect in the same record shell and was measured in
the same pass. [[ITEM-0167]] would propagate this shell to more pages.
[[ITEM-0165]] and [[ITEM-0166]] concern the two panels on the same record page
that sit outside the form entirely.

## Resolution

Fixed by honouring `labelVisible` everywhere a section heading is drawn, and
setting it on the sections that need it.

- `apps/web/lib/runtime/metadata-runtime.types.ts` — added
  `labelVisible?: boolean` to `FormSectionMetadata`. It did not exist on this
  type before; only the unrelated `CustomizationFormRenderer` form type
  (`customization-forms.ts`) carried the equivalent field, which is why the
  entity-record-page renderer had nothing to read.
- `apps/web/app/components/metadata/runtime-metadata-form-renderer.tsx` —
  both remaining branches (the custom-content branch and the plain-fields
  branch) now check `section.labelVisible !== false` before rendering the
  `<h4>`, matching the one branch (`CustomizationFormRenderer`'s) that
  already did. The custom-content branch keeps its pre-existing guard against
  a falsy `section.label` in addition.
- `apps/web/lib/runtime/modules/employee-metadata.adapter.ts` — set
  `labelVisible: false` on the three sections the record named
  (`profile-image`, `timeline`, `reporting-hierarchy`) **and** on
  `agent-desktop`, found while applying the same rule: it has the identical
  `fields: []` plus one self-titling system widget shape, and was not in the
  bug's original heading count only because the Agent tab is not the default
  tab.
- Settled the profile naming as "Profile Photo" — the name already used in
  three other places in `module-widget-renderer.tsx` (loading, error, and
  the widget's own visible heading in `runtime-profile-image-card.tsx`) —
  rather than the section's previous "Profile Image", which appeared nowhere
  else.

## QA Retest

Pending a live browser pass — no QA agent ran in this session.
`apps/web`'s automated suite (`npm --workspace web run test`, `check-types`)
is green, including new regression tests exercising `mapEmployeeForms([])`'s
section metadata directly and the renderer's source structurally (`apps/web`'s
jest has no jsdom, so heading counts could not be asserted by rendering). See
REG-416 and QA-RUNTIME-043 for what a future QA pass should re-run against a
live employee record.

## History

- 2026-09-12 — created at `06ed3592` from the residual observations of the
  eight-point demo walkthrough, measured live on the employee record.
- 2026-09-12 — fixed for SESSION-0103. See Resolution. Regression coverage:
  REG-416, QA-RUNTIME-043.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0167]]
- Modules — [[tenant-application]]
- Regression — REG-416 (see the regression register)

<!-- GRAPH:END -->
