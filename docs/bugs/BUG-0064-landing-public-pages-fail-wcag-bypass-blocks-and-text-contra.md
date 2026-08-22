---
ID: BUG-0064
aliases: [BUG-0064]
Title: Landing public pages fail WCAG bypass blocks and text contrast on every route
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: f58ee1d
AffectedModules: [apps/landing]
OwnerAgent: frontend
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-17-landing-uiux-browser-qa-f58ee1d.md
RegressionId: REG-060
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/landing-uiux-remediation
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-18
ResolvedAt: 2026-08-18
---

# BUG-0064 — Landing public pages fail WCAG bypass blocks and text contrast on every route

## Summary

Two conformance failures that are not confined to one screen, because both live
in shared code — the site shell and a design token. Every public landing route
is affected.

1. **No bypass mechanism (WCAG 2.4.1, Level A).** There is no skip link, so a
   keyboard user traverses nine header stops before reaching main content, on
   every page.
2. **Insufficient text contrast (WCAG 1.4.3, Level AA).** The `--muted-soft`
   token resolves to `#7b8791`, giving 3.67:1 on white and 3.34:1 on
   `#f2f5f4` — below the 4.5:1 required for normal-size text.

They are filed together because they share a surface, an owner and a retest,
not because they share a fix.

## Expected Behavior

A skip link is the first focusable element and jumps to `<main>`. All normal-size
text meets 4.5:1 against its actual background.

## Actual Behavior

Focus enters the logo, six nav links, Login and Start subscription before any
page content. The `--muted-soft` token is used for `(optional)` field markers,
consent copy and helper text, so the least readable text on the page is the text
carrying form semantics.

## Reproduction

**Bypass blocks**

1. Open any landing route, e.g. `http://localhost:3010/plans`.
2. Press Tab repeatedly from page load.
3. Count the stops before focus enters `<main>` — ten.

**Contrast**

1. Open `http://localhost:3010/contact` or `/partners`.
2. Run axe-core, or inspect any `.text-muted-soft` span.

## Evidence

Keyboard traversal probe:

```
PROBE tabs-to-reach-main-content :: FAIL :: tabsBeforeMain=10
  trail=1:a"" > 2:a"Home" > 3:a"Features" > 4:a"Plans" > 5:a"About"
      > 6:a"Contact" > 7:a"Partners" > 8:a"Login" > 9:a"Start subscription"
      > 10:a"Contact us"[main]
```

The in-page audit recorded `skip=false` on all 14 routes at all three viewports.

axe-core, `color-contrast`, impact **serious**, 21 nodes across `/contact` and
`/partners`:

```
/contact  | label[for="…-last"] > .text-muted-soft.font-normal
  insufficient color contrast of 3.67 (fg #7b8791, bg #ffffff, 14px, normal).
/contact  | span > .text-muted-soft
  insufficient color contrast of 3.34 (fg #7b8791, bg #f2f5f4, 14px, normal).
/partners | .mt-3
  insufficient color contrast of 3.67 (fg #7b8791, bg #ffffff, 12px, normal).
```

Focus visibility itself is fine and should not be changed while fixing this:

```
PROBE header-focus-visible :: PASS :: {"outlineStyle":"solid","outlineWidth":"2px"}
```

## Root Cause

- `apps/landing/app/_components/site-shell.tsx:23-97` — `SiteHeader` renders no
  skip link, and `PageShell` (line 126) supplies the `<main>` that has no target
  id.
- `apps/landing/app/globals.css:21` — `--muted-soft: #7b8791`, exposed as the
  Tailwind `text-muted-soft` / `placeholder:text-muted-soft` utilities and used
  in `contact-form.tsx:277,298,378,430`,
  `partner-inquiry-form.tsx:325,364,408` and `lead-form-section.tsx:425,499`.

## Impact

Public and unauthenticated, on all 14 routes. Level A and Level AA failures on
the company's own marketing site, which is the surface most likely to be
audited externally.

## Affected Areas

`apps/landing/app/_components/site-shell.tsx`,
`apps/landing/app/globals.css`, and every form consuming `text-muted-soft`.

## Proposed Resolution

Add a visually-hidden-until-focused skip link as the first element in the body,
targeting an id on the `PageShell` `<main>`. Darken `--muted-soft` until it
clears 4.5:1 against both `#ffffff` and `#f2f5f4` — the darkest current usage
background — and re-run axe rather than assuming one value fixes both. Because
the token is shared, confirm the new value against `apps/web` and `apps/admin`
if it is mirrored there.

## Acceptance Criteria

1. The first Tab from page load focuses a visible skip link; activating it moves
   focus into `<main>`.
2. axe-core reports zero `color-contrast` violations on `/contact` and
   `/partners`.
3. No regression in focus visibility.

## Regression Coverage

Needs an axe assertion in the landing browser suite plus a keyboard scenario for
the skip link. No `REG-nnn` yet.

## Dependencies

None.

## Related Items

[[BUG-0063-request-demo-form-blocks-submission-with-no-feedback-and-is-]],
[[BUG-0062-landing-mobile-navigation-menu-stays-open-after-navigating-a]],
[[ITEM-0051-align-landing-public-form-conventions-and-minor-accessibilit]]

## Resolution

**Bypass blocks.** A skip link is now the first element in the body, visually
hidden until focused, targeting `#main-content` on the single `<main>` in
`PageShell`. That `main` takes `tabIndex={-1}` so activating the link moves focus
rather than only the scroll position.

**Contrast.** `--muted-soft` changed from `#7b8791` to `#626c77` in
`globals.css` — the shared token, not the individual components. Measured against
the three backgrounds it is actually used on: 5.34:1 on `#ffffff`, 4.87:1 on
`--surface-muted`, 4.58:1 on `--accent-soft`. It stays lighter than `--muted`
(5.82:1), so the two-step hierarchy survives the fix.

## QA Retest

```
skip-link-is-first-tab  :: PASS :: {"text":"Skip to main content","href":"#main-content","visible":true}
skip-link-moves-focus   :: PASS :: {"id":"main-content","tag":"MAIN"}
header-focus-visible    :: PASS :: unchanged, 2px solid outline
```

axe-core across 14 routes x 3 viewports on a production build: **zero
serious/critical violations**, down from 21 `color-contrast` nodes. Skip link
present on 42/42 route-viewport combinations.

QA run: `docs/qa/runs/2026-08-18-landing-uiux-remediation-verification.md`

## History

- 2026-08-17 — created from qa run at `f58ee1d`.
- 2026-08-18 — fixed and verified on `agent/landing-uiux-remediation`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[landing-architecture]]
- Regression — REG-060 (see the regression register)

<!-- GRAPH:END -->
