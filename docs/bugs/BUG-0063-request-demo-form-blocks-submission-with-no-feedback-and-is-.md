---
ID: BUG-0063
aliases: [BUG-0063]
Title: Request demo form blocks submission with no feedback and is unusable by assistive technology
Status: OPEN
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: f58ee1d
AffectedModules: [apps/landing]
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-17-landing-uiux-browser-qa-f58ee1d.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt:
---

# BUG-0063 — Request demo form blocks submission with no feedback and is unusable by assistive technology

## Summary

The shared lead form on `/request-demo` disables its submit button until every
required field is filled, and offers no explanation of what is missing. Its
inputs additionally carry no `name`, `id`, `required`, `aria-required`,
`aria-invalid`, `aria-describedby` or `autocomplete`, and its error messages sit
in a plain `<span>` with no live region. A screen-reader user cannot tell which
fields are required, cannot be told a field is invalid, and cannot discover why
the button will not activate.

The same repository already contains the correct implementation: the `/contact`
form keeps its submit enabled, reports errors on submit, moves focus to the first
invalid control, and wraps its messages in `role="alert"` / `aria-live`. This is
a consistency defect as much as an accessibility one — the good pattern exists
and this form does not use it.

## Expected Behavior

The submit control stays operable. Pressing it with an incomplete form runs
validation, renders each message, associates it with its input
(`aria-invalid` + `aria-describedby`), announces it through a live region, and
moves focus to the first invalid field — the behaviour `/contact` already has.
Inputs carry `name`, `required` and appropriate `autocomplete` tokens.

## Actual Behavior

The button is `disabled` on load. Activating it does nothing and renders no
message. Nothing communicates required-ness except a `*` glyph appended to the
visible label text.

## Reproduction

1. Open `http://localhost:3010/request-demo`.
2. Observe the **Request demo** button is disabled with no stated reason.
3. Click it. Nothing happens and no message appears.
4. Inspect any input: no `name`, `id`, `required` or `autocomplete` attribute.
5. Fill every required field, set the email to `not-an-email`, submit. The
   message appears visually but is not associated with the input.

## Evidence

Chromium probes:

```
PROBE request-demo-submit-disabled-until-valid :: FAIL ::
  disabledOnLoad=true label="Request demo" aria-describedby=null aria-disabled=null
PROBE request-demo-empty-submit-feedback :: FAIL ::
  visibleErrorsAfterClickingDisabledSubmit=0
PROBE request-demo-error-programmatic-association :: FAIL ::
  sample=[{"ariaInvalid":null,"describedBy":null,"name":null,"id":null,
           "required":false,"autocomplete":null}, ...]
```

The control, on `/contact`:

```
PROBE contact-submit-enabled-on-load :: PASS :: disabledOnLoad=false
PROBE contact-empty-submit-shows-errors :: PASS ::
  errors=1 focusAfterSubmit={"tag":"input"}
```

axe-core also reports `page-has-heading-one` on this route — the page has no
`<h1>` at all, because the form section opens at `<h2>`.

A repository-wide search for live regions finds them in
`apps/landing/app/contact/contact-form.tsx:147,387` and
`apps/landing/app/partners/partner-inquiry-form.tsx:340` — and none in the
shared lead form.

## Root Cause

`apps/landing/app/_components/marketing/lead-form-section.tsx`:

- line 347 — `disabled={isSubmitting || !isFormValid}` gates the button on
  completeness, so `validate()` and its messages are unreachable for the
  empty-field case they were written for.
- lines 422-432 — the `Field` input receives only `className`, `onChange`,
  `placeholder`, `type` and `value`. No `name`, `id`, `required` or
  `autocomplete`.
- lines 433, 475, 506 — errors render as a bare `<span>` inside the `<label>`,
  with no `aria-describedby` and no live region. Because the span sits inside
  the label, the message is also folded into the field's accessible *name*
  rather than its description.

## Impact

Public and unauthenticated, on a primary lead-capture route. Assistive-technology
users cannot complete the form reliably; sighted keyboard users get a dead
button with no explanation; autofill does not work for anyone, which raises
abandonment on the highest-intent form on the site.

## Affected Areas

`apps/landing/app/_components/marketing/lead-form-section.tsx`, consumed by
`/request-demo`.

## Proposed Resolution

Adopt the `/contact` pattern rather than inventing a third one: keep submit
enabled, validate on submit, associate messages with `aria-invalid` +
`aria-describedby`, announce through `role="alert"`, move focus to the first
invalid control, and add `name`/`required`/`autocomplete` to every input. Add an
`<h1>` to the route. Consider consolidating both forms onto one shared
implementation so the two cannot drift again.

## Acceptance Criteria

1. The submit button is operable on load.
2. Submitting an empty form renders a message per invalid field and moves focus
   to the first one.
3. Each message is linked to its input by `aria-describedby`, with
   `aria-invalid="true"` on the input.
4. Errors are announced through a live region.
5. Every input carries `name` and an appropriate `autocomplete` token; required
   inputs carry `required`.
6. `/request-demo` has exactly one `<h1>`.

## Regression Coverage

Needs a browser scenario asserting empty-submit produces associated, announced
errors. No `REG-nnn` yet.

## Dependencies

None.

## Related Items

[[BUG-0064-landing-public-pages-fail-wcag-bypass-blocks-and-text-contra]],
[[ITEM-0051-align-landing-public-form-conventions-and-minor-accessibilit]]

## Resolution

Not yet fixed.

## QA Retest

Pending.

## History

- 2026-08-17 — created from qa run at `f58ee1d`.
