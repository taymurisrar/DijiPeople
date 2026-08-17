---
ID: ITEM-0046
aliases: [ITEM-0046]
Title: Add landing loading error and not-found boundaries
Type: UX
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/landing]
Source: QA_RUN
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
RelatedBug:
RelatedQA: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0046 — Add landing loading error and not-found boundaries

## Summary

The public landing app has no App Router `loading`, `error` or `not-found`
boundary, so failures and misses fall through framework defaults instead of the
product's accessible shell and recovery paths.

## Why It Matters

Prospects encountering a failed fetch or bad marketing URL receive an
unbranded/unhelpful state at the top of the commercial funnel.

## Evidence

`docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md:57` records that
none exist. Current `apps/landing/app/` contains no matching boundary files.

**Re-confirmed with browser evidence at `f58ee1d`**
(`docs/qa/runs/2026-08-17-landing-uiux-browser-qa-f58ee1d.md`). The consequence
is now measured rather than predicted — both fallback states are the least
accessible pages on the site:

- The **not-found** state (`GET /this-route-does-not-exist`, correctly 404) has
  no `main` landmark. axe-core reports `landmark-one-main` and `region`; the
  in-page audit recorded `main=0`.
- The **error** state, reproduced through BUG-0061, additionally fails
  `html-has-lang` and `document-title` — no language, no page title, no landmark.

So a visitor who hits either state gets an unbranded page that also drops the
`lang` attribute and the accessible structure the rest of the site has. That
raises this from a polish item to the containment layer for BUG-0061.

## Proposed Approach

UI/UX specifies minimal accessible states using the existing landing shell;
Frontend implements the boundaries and Playwright verifies recovery/not-found.

## Acceptance Criteria

- Loading, unexpected error and not-found states render branded accessible copy.
- Error state offers a working retry or safe navigation action.
- Playwright covers not-found and an induced route error.

## Dependencies

None.

## Related Items

[[landing-architecture]] · [[commercial-onboarding-lifecycle]] · [[TASK-0005]] ·
[[BUG-0061-landing-home-and-subscribe-pages-return-500-when-the-plans-f]] ·
[[ITEM-0051-align-landing-public-form-conventions-and-minor-accessibilit]]

## History

- 2026-08-17 — created at `0051180`.
- 2026-08-17 — re-confirmed at `f58ee1d` with axe evidence for both the 404 and
  error states; linked to BUG-0061, which is the failure this would contain.
