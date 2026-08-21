---
ID: BUG-0314
aliases: [BUG-0314]
Title: The notifications page is a placeholder under a permanently lit badge
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: aab6965
AffectedModules: [apps/admin, api:platform-events]
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


# BUG-0314 — The notifications page is a placeholder under a permanently lit badge

## Summary

`/notifications` showed the signed-in operator their own email address, their
tenant name, and a paragraph explaining that notification delivery was
controlled centrally. The topbar bell carried a hardcoded red dot: markup, not a
count, permanently lit.

## Expected Behavior

The bell indicates whether something needs attention, and the page says what.

## Actual Behavior

The dot was always on and meant nothing; the page had nothing behind it.

## Reproduction

Open Platform Admin. The bell has a red dot. Click it. The page shows your own
email address.

## Evidence

- `apps/admin/app/(internal)/notifications/page.tsx` — three key-value rows and
  a paragraph.
- `apps/admin/app/_components/admin-topbar.tsx` — the dot as a literal `span`
  with no state behind it.
- `PlatformEvent` already recorded provisioning, billing, webhook and lifecycle
  outcomes, and `apps/admin/app/api/platform/events` already proxied them.

## Root Cause

The feed was never built, and the indicator shipped ahead of it. An indicator
that is always on is worse than none: it teaches the person looking at it that
indicators in this console can be ignored, so the day one matters the channel is
already discredited.

## Impact

A failed provisioning run — a customer who has paid and has no workspace — had
no route to an operator's attention other than somebody opening the tenant.

## Affected Areas

`apps/admin` notifications and topbar, `platform-events`.

## Proposed Resolution

Project `PlatformEvent` into an operator feed, narrowed to events that need
somebody. Derive unread from a per-user timestamp. Show the count, or nothing.

## Acceptance Criteria

- The badge shows a real unread count and disappears at zero.
- The feed shows failures with what to do about them, and links to the record.
- Routine audit traffic does not appear.

## Regression Coverage

REG-180 —
`services/api/src/modules/platform-events/platform-notifications.spec.ts`. Its
assertions are mostly about what is **excluded**, because the failure mode is a
feed showing everything, which trains people to ignore the badge.

## Dependencies

None.

## Related Items

[[BUG-0315]] — the neighbouring placeholder screen, fixed with it.

## Resolution

Fixed on `agent/admin-landing-ux-program`.

## QA Retest

Covered by the spec above; the rendered feed was not opened in a browser.

## History

- 2026-08-21 — reported as "why notifications doesn't come and shows a weird
  screen".
