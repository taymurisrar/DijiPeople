---
ID: BUG-1955
aliases: [BUG-1955]
Title: Every 404 is reported to the user as DATABASE_RECORD_NOT_FOUND with the raw HTML body as its message
Status: DEFERRED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DEFER
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-1955 — Every 404 is reported to the user as DATABASE_RECORD_NOT_FOUND with the raw HTML body as its message

## Summary

> **NOT NATURALLY REPRODUCED. This record is filed on a synthetic trigger only.**
> The behaviour below was produced by a QA probe fetching a path that has no Next
> proxy route, which is not something a customer does. The two defects it exposes
> are generic to the client fetch interceptor and would apply to any non-JSON
> error response — but that generalisation is **inferred, not observed**. The
> record is `BLOCKED` on a natural reproduction (for example a forced upstream
> 502 or 504) and must not be treated as a confirmed production defect until one
> exists.

The tenant web app's global fetch interceptor maps an HTTP 404 to the error code
`DATABASE_RECORD_NOT_FOUND` and, when the response body is not JSON, renders the
entire body as the error message.

## Expected Behavior

An HTTP status is mapped to an error code that describes what actually happened —
a routing or gateway 404 is not a database record-not-found. A response the client
cannot parse as the standard error contract produces a generic, human-readable
failure message; the raw body is logged, never rendered.

## Actual Behavior

The app displayed a modal titled `ERROR DATABASE_RECORD_NOT_FOUND` whose body was
the entire HTML source of the SPA's 404 page, beginning
`<!DOCTYPE html><html …>`.

Two defects in one interceptor:

**(a)** the code is wrong. A routing or proxy 404 is reported as a database
record-not-found, which also misleads anyone later reading it in the client error
log.

**(b)** the message is the raw response body. Any non-JSON error response — a
gateway 502 or 504 HTML page, a CDN error page — would be rendered to a customer
the same way.

## Reproduction

**Synthetic only.** Target `https://dijipeople-demo.ws.dijipeople.com`, production
API commit `949f461c`, observed 2026-08-29.

1. Sign in to the tenant workspace.
2. From the page, fetch a path on the tenant origin that has no Next proxy route,
   so the SPA returns its HTML 404 page rather than a JSON error envelope.
3. Observe the modal: title `ERROR DATABASE_RECORD_NOT_FOUND`, body the raw HTML
   document.

A natural reproduction has **not** been found. The obvious candidate is forcing a
gateway error (502/504) so an HTML error page reaches the interceptor through a
path a customer's browser really takes.

## Evidence

The rendered modal, as described above. No file:line evidence was collected: the
QA run did not locate the interceptor in `apps/web`, so the mapping table and the
message-selection code still need to be found and quoted before anyone fixes
this.

One side effect worth recording, because it affects the production error log: the
interceptor POSTs to `/api/error-logs/client`, so probes of this kind pollute the
production client error log with entries that describe no real customer failure.

## Root Cause

Not established.

## Impact

If the generalisation holds, a customer hitting any upstream error that returns
HTML sees a wall of markup in a modal, and the platform's own error log records
the wrong error class for it. Rated MEDIUM: it is a presentation and diagnosis
defect, not a data or authorization one — and it is not yet known to be reachable
by a customer at all, which is exactly why this record is `BLOCKED` rather than
`OPEN`.

## Affected Areas

`apps/web` global fetch interceptor and its error modal; `error-logs` client
ingestion, which receives the mislabelled code.

## Proposed Resolution

Locate the interceptor, then: map status codes to codes that describe the
transport failure (a 404 with no JSON envelope is a routing failure, not a record
lookup), and render a fixed generic message whenever the body does not parse as
the standard error contract, keeping the raw body for the log only.

Before any of that, get a natural reproduction or close the record as
unreproducible.

## Acceptance Criteria

- A natural reproduction exists and is recorded here, or this record is closed.
- A non-JSON error response renders a generic message; no response body is shown
  verbatim to the user.
- A 404 from a route that does not exist does not report a database error code.

## Regression Coverage

None yet. A test that stubs a fetch returning an HTML body with status 404 and
asserts both the code and the rendered message would fail today.

## Dependencies

Blocked on obtaining a natural reproduction.

## Related Items

BUG-1549 (database and validator internals surfaced in user-facing errors) is the
admin console's version of the same theme and is already VERIFIED; this record is
the tenant app's fetch layer and a different mechanism.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a natural reproduction before any retest is meaningful.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Filed `BLOCKED` because the trigger was synthetic.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition DEFER — real but synthetic-trigger-only; revisit when a natural 502/504 reproduction exists.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
