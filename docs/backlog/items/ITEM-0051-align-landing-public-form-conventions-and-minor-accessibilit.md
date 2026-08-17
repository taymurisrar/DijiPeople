---
ID: ITEM-0051
aliases: [ITEM-0051]
Title: Align landing public form conventions and minor accessibility gaps
Type: UX
Status: DEFERRED
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/landing]
Source: QA_RUN
OwnerAgent: frontend
ArchitectDisposition: DEFER
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
RelatedBug: BUG-0063
RelatedQA: docs/qa/runs/2026-08-17-landing-uiux-browser-qa-f58ee1d.md
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0051 — Align landing public form conventions and minor accessibility gaps

## Summary

The landing site has four public forms built at different times, and they
disagree with each other on how required fields are marked, whether inputs carry
autofill hints, and what a page is titled. None of these is severe on its own —
the severe cases are filed separately as BUG-0063 and BUG-0064 — but together
they are the reason the public surface reads as several products rather than
one. This item groups the medium and low findings from the same browser pass so
they can be fixed in a single sweep rather than as seven separate records.

## Why It Matters

These are the cheapest possible fixes and they sit on the acquisition funnel.
Left alone they keep costing conversion quietly: autofill that does not fire,
tabs that do not say which page they are, and a required-field convention a
returning visitor has to relearn on each form.

## Evidence

All from the Chromium pass at `f58ee1d`, 14 routes x 3 viewports.

**1. Three different required/optional conventions across four forms**

| Route | Convention | Inputs with `required` |
|---|---|---|
| `/contact` | `(optional)` suffix | 4 of 10 |
| `/request-demo` | ` *` suffix | 0 of 9 |
| `/partners` | `*` suffix, no space | 10 of 12 |
| `/subscribe` | none stated | 4 of 8 |

`/request-demo` marking nothing programmatically is covered by BUG-0063; the
disagreement between the other three belongs here.

**2. Six routes fall back to the generic site title**

`/partners`, `/subscribe/success`, `/subscribe/cancel`, `/sign/[token]`,
`/partners/activate/[token]` and `/partners/onboarding/[token]` all render
`DijiPeople | HRM SaaS for Growing Operational Teams`. `/about`, `/features`,
`/plans`, `/contact`, `/request-demo` and `/subscribe` each have a specific
title. `/partners` is a marketed public route.

**3. Footer links are below the minimum target size (WCAG 2.5.8, AA)**

Measured at 390x844 on all 14 routes: `Plans` 35x20, `Contact` 53x20,
`Subscribe` 65x20 CSS px. The 24x24 minimum is missed on the vertical axis.
Source: `apps/landing/app/_components/site-shell.tsx:116-120`.

**4. Password fields have no autocomplete token**

`/partners/activate/[token]` — `password` and `confirmPassword` carry no
`autocomplete`, so password managers do not offer to generate or save. They
should be `new-password`.

**5. Navigation has no active state**

`site-shell.tsx:38-48` renders every nav item with identical classes and no
`aria-current`. Nothing indicates which page the visitor is on, in either the
desktop nav or the mobile panel.

**6. Footer has no legal or company links**

Only Plans, Contact and Subscribe. A site that collects names, work emails and
phone numbers through four forms exposes no privacy policy or terms link
anywhere in the shell.

**7. Contact details are not actionable**

`lead-form-section.tsx:209-223` renders the business email, support email and
phone as plain text. On mobile they are not tappable.

**8. Hydration mismatch on the partner activation route**

```
ERROR | /partners/activate/not-a-real-token |
  A tree hydrated but some attributes of the server rendered HTML didn't match
  the client properties.
```

Observed on all three viewports. Not root-caused by this pass — it needs
diagnosis before it can be estimated, which is why it is recorded here rather
than as a bug with an unproven cause.

## Proposed Approach

One sweep over `site-shell.tsx` plus the four form components. No ExecPlan
required. Pick one required-marking convention and apply it everywhere —
`/contact`'s `(optional)` suffix is the better choice for a marketing surface
because it keeps the common case unmarked. Item 8 should be diagnosed first and
split into its own bug record if the cause turns out to be substantive.

## Acceptance Criteria

1. One required/optional convention across all four public forms, with the
   matching `required` attribute on every required input.
2. Every public route sets a distinct `<title>`.
3. Footer link targets are at least 24x24 CSS px.
4. Activation password fields carry `autocomplete="new-password"`.
5. The current route is indicated with `aria-current="page"` in both navigations.
6. Privacy and terms links are reachable from the footer, or a decision is
   recorded that they do not exist yet.
7. Email and phone in the contact block are `mailto:` and `tel:` links.
8. The hydration warning on `/partners/activate/[token]` is diagnosed and either
   fixed or promoted to its own record.

## Dependencies

None. Overlaps the same files as
[[BUG-0064-landing-public-pages-fail-wcag-bypass-blocks-and-text-contra]] and
[[BUG-0062-landing-mobile-navigation-menu-stays-open-after-navigating-a]], so
sequencing them together avoids three passes over `site-shell.tsx`.

## Related Items

[[BUG-0063-request-demo-form-blocks-submission-with-no-feedback-and-is-]],
[[BUG-0064-landing-public-pages-fail-wcag-bypass-blocks-and-text-contra]],
[[BUG-0062-landing-mobile-navigation-menu-stays-open-after-navigating-a]],
[[ITEM-0046-add-landing-loading-error-and-not-found-boundaries]]

## History

- 2026-08-17 — created at `f58ee1d` from the landing UI/UX browser pass.
