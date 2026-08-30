---
ID: BUG-2460
aliases: [BUG-2460]
Title: Client error reports store the whole HTML error page as the incident message
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: 39d8ddc4
AffectedModules: [web:error-reporting, api:error-logs, admin:monitoring]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-369
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2460 — Client error reports store the whole HTML error page as the incident message

## Summary

When a request from the tenant workspace hits a path the Next.js app does not
proxy, Next answers with its own HTML 404 page. The client error reporter reads
that response body as the error message and posts it verbatim to
`POST /api/error-logs/client`, which stores it. The result is incident rows
whose `message` is a **14 KB HTML document** — doctype, inlined CSS custom
properties, script tags and all. Thirteen such rows are in the production
queue. The monitoring screen renders that as the incident title.

## Expected Behavior

An incident message is a short, human-readable sentence. When an error response
is not the JSON error contract — an HTML page, an empty body, a proxy error —
the reporter records a bounded, meaningful message and keeps the raw body out
of the message field entirely.

## Actual Behavior

The full HTML body becomes `message`. It is stored, indexed, listed in the
admin queue and returned by `GET /api/platform/logs/events`, where it displaces
every other row in any listing that renders messages.

## Reproduction

1. From an authenticated tenant workspace page, issue a `fetch` to an
   `/api/...` path the web app does not proxy — for example
   `/api/audit?page=1` (the real proxy is `/api/audit-logs`).
2. Next returns its HTML 404 page with `content-type: text/html`.
3. The client error reporter posts it to `POST /api/error-logs/client`.
4. Open `https://admin.dijipeople.com/settings/monitoring/error-logs` — the new
   row's message begins `<!DOCTYPE html><html lang="en" class="instrument_sans…`.

## Evidence

Production queue read 2026-08-30 (API commit `ec1d58d`). Thirteen rows whose
message is an HTML document, all `sourceApp: web`, all `client_*` traces:

```
2026-08-29T01:20  404  GET /api/attendance/team/summary?date=2026-08-29  len=14456
2026-08-29T01:20  404  GET /api/attendance/team/summary?date=2026-08-27  len=14456
2026-08-29T01:10  404  GET /api/views/d93832a2-5fb8-5f63-8d87-4baccc78332d  len=14405
2026-08-29T01:07  404  GET /api/audit?page=1                             len=14403
2026-08-28T23:55  404  GET /api/tenant-settings/features/availability     len=14255
2026-08-28T23:51  404  GET /api/leave/requests                            len=14228
2026-08-28T23:51  404  GET /api/recruitment/candidates                    len=14236
… 13 rows total, 14.2–14.5 KB each
```

The paths themselves were reached by console probing during an earlier QA
session, not by product code — `/api/attendance/team/summary` exists on the API
(`attendance.controller.ts:178`) but has no web proxy, and `/api/audit` and
`/api/views` are not real web routes at all. **The probing is not the bug.** The
bug is that any such response is stored whole, and the next one will be too.

Persist path with no guard on message shape:
`services/api/src/modules/error-logs/error-logs.controller.ts:38-45` —
`message: readString(body.message) ?? 'Client error'` accepts whatever the
client sends.

## Root Cause

Two layers each assume the other validates:

- The client reporter assumes an error response carries the JSON error contract
  (`{ success, traceId, errorCode, message, … }`) and falls back to the raw
  body text when it does not parse.
- `persistClientLog` accepts any string as `message`, with no length bound and
  no content check, because the body is treated as already-sanitised telemetry
  from our own app.

Neither is unreasonable alone. Together they let a 14 KB document into a field
the admin UI renders as a title.

## Impact

- The monitoring queue becomes unreadable wherever one of these rows appears.
- `ErrorLog` rows are ~14 KB each instead of ~200 bytes, and
  `GET /platform/logs/events` carries them in every page that includes one.
- Any future non-JSON error response — a CDN error page, a gateway timeout page,
  a proxy 502 — produces the same thing, so the volume is not bounded by the
  probing that revealed it.

No sensitive data is exposed: the captured pages are unauthenticated Next error
pages. Severity MEDIUM.

## Affected Areas

- `services/api/src/modules/error-logs/error-logs.controller.ts`
- The `apps/web` client error reporter and its fetch interceptor
- `https://admin.dijipeople.com/settings/monitoring/error-logs`

## Proposed Resolution

Defend on both sides, because either alone leaves the other exposed:

1. **Server** — bound and sanitise in `persistClientLog`: cap `message` at a
   sane length, and when the value looks like a markup document, replace it with
   a description of the response (status, content type, first meaningful text)
   rather than storing the document. Keep any truncated remainder in `details`
   if it is worth keeping at all.
2. **Client** — when an error response is not the JSON error contract, build the
   message from the status and the request, not from the body.

No ExecPlan needed.

## Acceptance Criteria

- A client report whose `message` is an HTML document is stored with a short,
  readable message.
- `message` has an enforced maximum length, asserted by a test.
- The existing behaviour for well-formed client reports is unchanged.
- The thirteen existing rows are covered by the backfill in [[BUG-2465]] or
  left as historical evidence, but no new ones appear.

## Regression Coverage

A spec posting an HTML body to `persistClientLog` and asserting the stored
message is short and does not begin with a doctype. Registered as a regression
entry once written.

## Dependencies

None.

## Related Items

[[BUG-2465]] — the other defect on the same client-reporting path, and the
backfill that would clean these rows. [[BUG-2459]] — the other large source of
client-side error-log volume. [[BUG-1754]] — the queue-noise record this
family descends from.

## Resolution

Extracted to `services/api/src/modules/error-logs/client-error-message.ts` so
it could be tested directly, and applied in `persistClientLog`.

A markup body is **replaced**, not truncated — 500 bytes of doctype and inline
CSS is as useless as 14 KB of it. The stored message becomes "The server
returned an HTML error page (status N) where a JSON error response was
expected."; the status was already recorded in its own column and is the only
real information such a response carries. Non-markup messages are bounded at
500 characters.

The markup check is anchored at the start of the string, so a validation
message quoting an element ("Expected `<input>` to be present") survives intact.

## QA Retest

Pending.

## History

- 2026-08-30 — created from the production monitoring triage at `39d8ddc4`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-369 (see the regression register)

<!-- GRAPH:END -->
