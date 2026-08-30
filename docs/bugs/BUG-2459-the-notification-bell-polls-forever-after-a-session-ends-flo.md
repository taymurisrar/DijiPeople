---
ID: BUG-2459
aliases: [BUG-2459]
Title: The notification bell polls forever after a session ends, flooding the error log
Status: FIXED
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: 39d8ddc4
AffectedModules: [web:notifications, api:error-logs, api:notifications]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-368
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2459 — The notification bell polls forever after a session ends, flooding the error log

## Summary

`NotificationBell` and `NotificationPopupProvider` each poll the API every 60
seconds for the life of the mounted component. Neither stops when the request
comes back `401`. A tab left open after the session is revoked or expires
therefore keeps asking — twice a minute between the two components, forever —
and every one of those refusals is written to the production error log as an
incident. Four fingerprints in the production queue account for **1,033
recorded occurrences** on their own, all of them the same tab asking the same
question after the answer stopped being yes.

## Expected Behavior

When a polled request returns `401`, the client stops polling and moves the
user to sign-in (or waits for a successful refresh before resuming). A dead
session produces one recorded failure, not one every thirty seconds
indefinitely.

## Actual Behavior

`refresh()` catches every error into `setError(...)` and returns. The interval
is never cleared, no sign-out is triggered, and the next tick repeats the call.
The loop is unbounded in time, so a single forgotten tab can dominate the
platform's incident queue.

## Reproduction

1. Sign in to the tenant workspace and leave the tab open on any authenticated
   screen.
2. Revoke the session — sign out from another device, or let it be revoked
   server-side.
3. Watch the network panel: `GET /api/notifications/in-app/unread-count` and
   `GET /api/notifications/in-app?pageSize=10` keep firing every 60 seconds and
   keep returning `401 SESSION_REVOKED`.
4. Each one appears in `https://admin.dijipeople.com/settings/monitoring/error-logs`.

## Evidence

Production monitoring queue read 2026-08-30 (API commit `ec1d58d`). The four
highest-volume fingerprints attributable to this loop:

```
[518 occ / 2 rows] 401 SESSION_REVOKED  GET /api/notifications/in-app?pageSize=10
[515 occ / 2 rows] 401 SESSION_REVOKED  GET /api/notifications/in-app/unread-count
[423 occ / 107 rows] 401 AUTH_TOKEN_MISSING GET /api/notifications/in-app/unread-count
[422 occ / 106 rows] 401 AUTH_TOKEN_MISSING GET /api/notifications/in-app?pageSize=10
```

last seen `2026-08-30T13:39`. The two `SESSION_REVOKED` groups are the pure
signal — 1,033 occurrences from four fingerprints, i.e. a handful of tabs.

The code:

- `apps/web/app/(authenticated)/_components/notification-bell.tsx:52-59` —
  `window.setInterval(() => void refresh(false), 60_000)` with no status check
  and no teardown on failure.
- `apps/web/app/(authenticated)/_components/notification-bell.tsx:41-48` —
  `catch (requestError) { setError(...) }` swallows the `401`.
- `apps/web/app/(authenticated)/_components/notification-popup-provider.tsx:30`
  — a second, independent 60-second interval with the same shape.

## Root Cause

The poll loop treats every failure as a transient display problem. There is no
distinction between "the server hiccuped, try again next tick" and "this
session is over, there is nothing to try again for". Because the interval lives
in a `useEffect` with an empty dependency array, nothing outside the component
can stop it either.

## Impact

Two effects, and the second is the expensive one:

1. **For the user** — a stale tab shows a permanent error state on the bell and
   never routes them to sign-in, so the workspace looks broken rather than
   signed out.
2. **For the platform** — unbounded writes to `ErrorLog` from a client that
   cannot be reached. This is the single largest contributor to the incident
   queue and it grows without any user action. It also makes every genuine
   incident harder to find, which is the harm [[BUG-1754]] was filed to stop.

Reachable in production and observed there.

## Affected Areas

- `apps/web/app/(authenticated)/_components/notification-bell.tsx`
- `apps/web/app/(authenticated)/_components/notification-popup-provider.tsx`
- `GET /api/notifications/in-app`, `GET /api/notifications/in-app/unread-count`
- `ErrorLog` volume and the monitoring queue

## Proposed Resolution

Teach both pollers to recognise an authentication failure and stop:

- On `401`, clear the interval and stop scheduling further work.
- Hand off to the app's existing session-expiry path rather than rendering a
  generic error string, so the user is told they are signed out.
- Consider a shared poll helper so a third polling surface does not have to
  rediscover this.

No ExecPlan needed — it is contained to two client components plus whatever
helper they share.

## Acceptance Criteria

- A `401` from either polled endpoint stops that component's interval.
- No further `notifications/in-app*` requests are issued after the first `401`.
- The user is routed to sign-in rather than left on a permanent error badge.
- The behaviour is covered by a test that fails without the fix.

## Regression Coverage

A component test that mounts the bell with a fetch stub returning `401`,
advances timers past two intervals, and asserts exactly one request was made.
Registered as a regression entry once written.

## Dependencies

None. Independent of [[BUG-2458]], though the two together explain most of the
authentication noise in the queue.

## Related Items

[[BUG-2458]] — refresh throttling, the other half of the session-loss story.
[[BUG-2465]] — the classification gap that let these rows sit as `NEW`.
[[BUG-1754]] — the record that established expected protocol outcomes are not
incidents. [[BUG-2460]] — the other defect in the client error-reporting path.

## Resolution

`requestJson` in `apps/web/lib/notifications-api.ts` now throws a
`NotificationRequestError` carrying the HTTP status; it previously threw a bare
`Error` with only a message, which is why neither poller could tell a transient
failure from a dead session.

`NotificationBell` and `NotificationPopupProvider` each hold a
`sessionEndedRef`, set on a `401` and never unset. It guards the interval
callback (which clears its own timer) and `refresh` itself, because a click on
the bell can race a tick already scheduled. The bell now shows "Your session has
ended. Sign in again to see notifications." instead of surfacing the raw
"Session is no longer active." on a badge nobody can act on.

Only a `401` stops the loop. A `500` or `503` keeps retrying, because stopping
on those would leave a live session silently without notifications until reload
— asserted in `notification-auth-failure.spec.ts`.

**Coverage gap, stated rather than papered over:** the interval teardown itself
is not covered. `apps/web` has no jsdom or testing-library, so the component
cannot be mounted. What is covered is the request layer both fixes stand on —
if that regresses to a bare `Error`, both pollers silently resume looping and no
component test would have caught that either.

## QA Retest

Pending.

## History

- 2026-08-30 — created from the production monitoring triage at `39d8ddc4`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[notifications]]
- Regression — REG-368 (see the regression register)

<!-- GRAPH:END -->
