---
ID: BUG-0460
aliases: [BUG-0460]
Title: The notification badge counted over a window sized by the page it was fetching
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-22
DetectedInSha: 3883798
AffectedModules: [services/api/src/modules/platform-events, apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-191
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/tenant-repair-and-console-ux
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
---

# BUG-0460 — The notification badge counted over a window sized by the page it was fetching

## Summary

The notification badge showed nothing on sign-in and a count the moment the bell
was clicked. `notifications()` scanned `limit * 20` platform events, so the badge
— which polls with `limit=1` — counted unread notifications among **twenty**
events, while opening the popover asked for six and scanned a hundred and twenty.

## Expected Behavior

The unread count is the same number whoever asks and whatever page size they
ask with. A badge that changes when you open the panel it describes is worse
than no badge: it looks as though the act of looking created the news.

## Actual Behavior

`unreadCount` was a function of the caller's page size. Most platform events are
not notifiable, so a twenty-row scan usually found none and the badge stayed
dark until a wider read happened.

## Reproduction

1. Cause a notifiable failure — a failed provisioning run or webhook.
2. Emit routine platform events afterwards until more than twenty exist.
3. Sign in to Platform Admin. No badge.
4. Click the bell. The badge appears.

## Evidence

- `services/api/src/modules/platform-events/platform-events.service.ts` —
  `take: limit * 20`.
- The comment directly above the return claimed the count was computed "over
  everything in the window, not over the page". The page slice was excluded; the
  **window itself** was the page size times twenty.

## Root Cause

`assertion-without-a-check`, and the assertion was a comment. The distinction it
drew — page versus window — was real and the code implemented only half of it,
so the code read as correct to anybody who read the comment first.

## Impact

Every platform operator, on the one indicator meant to say whether anything
needs attention. Precisely the failure mode [[BUG-0314]] existed to end: an
indicator that cannot be trusted teaches its reader to stop looking.

## Affected Areas

`services/api/src/modules/platform-events`, and the badge and feed in
`apps/admin`.

## Proposed Resolution

Scan a fixed `NOTIFICATION_SCAN_LIMIT` regardless of `limit`, and return
`scanTruncated` when the scan hits its ceiling so the badge can render `99+`
rather than an exact number nothing stands behind. "Notifiable" is a rule over
the event code and result evaluated in TypeScript, so it cannot be a database
`count`; the scan has to be wide, and what it must not be is a function of how
many rows the caller wants to display.

## Acceptance Criteria

- `unreadCount` is identical for `limit=1` and `limit=50` over the same data.
- The scan size does not vary with `limit`.
- A truncated scan is reported, and the badge shows `99+` for one.

## Regression Coverage

REG-191 — `services/api/src/modules/platform-events/notification-count.spec.ts`.

## Dependencies

None.

## Related Items

[[BUG-0314]] — the permanently-lit dot this replaced.

## Resolution

Fixed on `agent/tenant-repair-and-console-ux`.

## QA Retest

Unit-verified. Not observed in a browser at sign-in.

## History

- 2026-08-22 — reported as "notification bell doesnt show counter at the login
  ... it shows until i click on the bell".
