---
ID: BUG-0315
aliases: [BUG-0315]
Title: Workspace preferences are stored in localStorage and never applied
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: aab6965
AffectedModules: [apps/admin, api:platform-users, services/api/prisma]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-180
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/admin-landing-ux-program
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-21
ResolvedAt: 2026-08-21
---


# BUG-0315 — Workspace preferences are stored in localStorage and never applied

## Summary

Workspace preferences — theme, density, landing page — were written to
`localStorage` and never read by anything. Choosing Compact changed a value in a
JSON blob and nothing on screen. The card said so, which made the limitation
honest and the feature useless.

## Expected Behavior

A preference persists against the person, and takes effect.

## Actual Behavior

Stored per browser, lost on a second machine or a cleared cache, and applied
nowhere.

## Reproduction

1. Open `/preferences`, set Density to Compact.
2. Nothing changes. Reload: still nothing.
3. Sign in from another browser: back to Comfortable.

## Evidence

- `apps/admin/app/_components/account-preferences-client.tsx` — wrote
  `dijipeople.admin.preferences` to `localStorage` and no consumer read it.
- No `theme` or `density` token existed in `apps/admin/app/globals.css`.
- `PATCH /platform-users/me/preferences` already existed and stored exactly one
  preference, the default dashboard view.

## Root Cause

The screen was built before a preference store existed, and the "no backend
preference API is currently exposed" note stopped being true without anything
revisiting the screen.

## Impact

Small in isolation. It is a settings page that does not settle anything, which
is the kind of thing that quietly teaches people the console is not to be
trusted.

## Affected Areas

`apps/admin` preferences and layout, `platform-users`, `PlatformUser`.

## Proposed Resolution

Three nullable columns on `PlatformUser`; extend the existing preferences
endpoint; apply the result to the document from the authenticated layout so it
takes effect on every page rather than only while the settings screen is open.
Landing page validated against an allow-list on both sides.

## Acceptance Criteria

- A preference set in one browser is present in another.
- Changing theme or density changes the rendered console.
- A landing route outside the allow-list is refused by the API.

## Regression Coverage

REG-180. The allow-list is enforced by `@IsIn` on the DTO, which the existing
DTO-contract suite exercises.

## Dependencies

Two additive migrations, applied.

## Related Items

[[BUG-0314]] — the neighbouring placeholder screen.

## Resolution

Fixed on `agent/admin-landing-ux-program`.

## QA Retest

Covered by the API suites; the rendered result was not opened in a browser.

## History

- 2026-08-21 — reported as "make sure preferences work".
