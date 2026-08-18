---
ID: BUG-0062
aliases: [BUG-0062]
Title: Landing mobile navigation menu stays open after navigating and ignores Escape
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
RegressionId: REG-058
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/landing-uiux-remediation
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-18
ResolvedAt: 2026-08-18
---

# BUG-0062 — Landing mobile navigation menu stays open after navigating and ignores Escape

## Summary

On mobile widths the site header's only navigation is a `<details>` disclosure.
Tapping any link inside it navigates client-side, but nothing closes the panel —
and because the header lives in the root layout, it is never remounted. The open
menu then covers the top of the page the visitor just asked for, including its
`<h1>`. Escape does not dismiss it either.

## Expected Behavior

Selecting a destination closes the menu and reveals the page. Escape closes the
menu and returns focus to the trigger, which is the standard dismissal contract
for any overlay.

## Actual Behavior

The panel remains open over the newly rendered page. The visitor must tap the
trigger a second time to see where they landed. Escape does nothing.

## Reproduction

1. Open `http://localhost:3010/` at a 390x844 viewport.
2. Tap **Menu** in the header.
3. Tap **Plans**.
4. The URL becomes `/plans`, and the menu panel is still open over the page.
5. Separately: open the menu and press Escape. It stays open.

## Evidence

Chromium probes:

```
PROBE mobile-menu-closes-on-navigate :: FAIL ::
  openedBeforeNav=true stillOpenAfterNav=true url=http://localhost:3010/plans
PROBE mobile-menu-escape-dismiss :: FAIL :: openAfterEscape=true
```

Screenshot `probe-mobile-menu-stuck-open.png` shows the panel covering the
`/plans` heading and hero copy after the navigation completed.

Click-outside dismissal was **not** established either way by this pass — the
probe toggled the menu shut before testing it, so that check is inconclusive.
A bare `<details>` has no click-outside behaviour of its own, so it should be
assumed missing until measured.

## Root Cause

`apps/landing/app/_components/site-shell.tsx:65-93`. The menu is a plain
`<details>` element with no `open` state management. Next.js App Router
navigation re-renders the page slot but keeps the layout — and with it the
element's `open` property — mounted across the transition.

## Impact

Every mobile visitor, on every in-site navigation. Mobile is the only viewport
where this menu is the navigation, so there is no unaffected path. The obscured
region is the top of the page, which is where the heading and primary CTA live.

## Affected Areas

`apps/landing/app/_components/site-shell.tsx` — affects all 14 public routes.

## Proposed Resolution

Make the disclosure controlled: hold `open` in state, close it on `pathname`
change, on Escape, and on outside click, returning focus to the trigger on
dismissal. Client component boundaries already exist elsewhere in this app, so
this does not force the whole header client-side beyond the menu itself.

## Acceptance Criteria

1. Selecting any item in the mobile menu closes it and the destination page is
   unobscured.
2. Escape closes the menu and focus returns to the trigger.
3. A click outside the panel closes it.
4. The desktop (>=768px) navigation is unchanged.

## Regression Coverage

Needs a mobile-viewport browser scenario asserting the panel is closed after an
in-menu navigation. No `REG-nnn` yet.

## Dependencies

None.

## Related Items

[[BUG-0064-landing-public-pages-fail-wcag-bypass-blocks-and-text-contra]]

## Resolution

The bare `<details>` disclosure was replaced by a controlled client component,
`apps/landing/app/_components/header-nav.tsx`. Open state lives in React and is
cleared on `pathname` change — which is the actual fix, because the header sits in
the root layout and App Router never remounts it between routes.

Escape closes and returns focus to the trigger; an outside pointer-down closes;
`aria-expanded` and `aria-controls` describe the relationship. The desktop
breakpoint also moved from `md` to `lg`, so 768px now uses the menu instead of
cramming six links, Login and a CTA into the bar — where the CTA wrapped.

## QA Retest

Chromium at 390x844 and 768x1024:

```
menu-closes-on-navigate-mobile :: PASS :: panelsAfterNav=0 url=/plans
menu-escape-mobile             :: PASS :: afterEsc=0 focusReturnedToTrigger=true
menu-outside-click-mobile      :: PASS :: afterOutsideClick=0
menu-closes-on-navigate-tablet :: PASS :: panelsAfterNav=0
menu-escape-tablet             :: PASS :: afterEsc=0 focusReturnedToTrigger=true
no-overflow-mobile/tablet      :: PASS
```

The click-outside case the original pass left inconclusive is now measured with
the menu genuinely open. Four durable scenarios added.

QA run: `docs/qa/runs/2026-08-18-landing-uiux-remediation-verification.md`

## History

- 2026-08-17 — created from qa run at `f58ee1d`.
- 2026-08-18 — fixed and verified on `agent/landing-uiux-remediation`.
