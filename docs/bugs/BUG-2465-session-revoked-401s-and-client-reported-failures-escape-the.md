---
ID: BUG-2465
aliases: [BUG-2465]
Title: Session-revoked 401s and client-reported failures escape the not-an-incident filter
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: 39d8ddc4
AffectedModules: [api:error-logs, api:platform-monitoring]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-371
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2465 — Session-revoked 401s and client-reported failures escape the not-an-incident filter

## Summary

[[BUG-1754]] taught the platform that a routine `401` and a `404` for a route
that does not exist are answers the protocol is *for*, not incidents a human
should triage, and `isExpectedProtocolOutcome` now files them as
`NOT_AN_INCIDENT`. The rule works — every row first seen after it deployed on
2026-08-28 is classified correctly. It has three gaps, and together they leave
**1,870 of 1,897 production incidents sitting in the triage queue as `NEW`**,
which is the same blindness [[BUG-1754]] was filed to remove.

The three gaps are: `SESSION_REVOKED` is absent from the recognised session
codes; a `404 TENANT_NOT_FOUND` from the public host-resolution endpoint is
treated as a failure when it is that endpoint's normal answer; and the rule was
never applied backwards over the rows recorded before it existed.

> **Correction, same day.** This record first listed a fourth gap — "the
> client-reported path never runs the rule at all". That is wrong, and the
> claim was withdrawn before any code was written against it. `persist` runs
> **every** caller through `initialSupportStatus`, the client path included.
> What the client path does not supply is `unmatchedRoute`, and it should not:
> see the note under Proposed Resolution. Production carries zero
> client-reported session `401`s, so the gap had no victims even in theory.

## Expected Behavior

Every recorded failure that is an expected protocol outcome arrives as
`NOT_AN_INCIDENT`, whether it was recorded by the exception filter or reported
by a browser, and regardless of whether it was recorded before or after the
rule shipped. The queue holds only what a person should act on.

## Actual Behavior

- `401 SESSION_REVOKED` — "Session is no longer active." — is filed as `NEW`.
  It is the same class of event as `SESSION_EXPIRED`, which is recognised.
- Failures arriving through `POST /api/error-logs/client` are persisted without
  `unmatchedRoute` and without consulting the rule, so a client-side `404`
  or session `401` is always `NEW`.
- The 1,843 rows recorded before 2026-08-28 keep `supportStatus: NEW` forever;
  new occurrences increment `occurrenceCount` on the existing row rather than
  creating a correctly-classified one.

## Reproduction

1. Open `https://admin.dijipeople.com/settings/monitoring/error-logs`.
2. Filter to `NEW`. The count is 1,870 of 1,897 total.
3. Read any `SESSION_REVOKED` row — for example
   `GET /api/notifications/in-app/unread-count`, 518 occurrences, last seen
   `2026-08-30T13:39`. It is `NEW`, while a `SESSION_EXPIRED` row on the same
   route recorded the same day is `NOT_AN_INCIDENT`.

## Evidence

Full queue pulled from `GET /api/platform/logs/events` on 2026-08-30
(API commit `ec1d58d`), 1,897 rows / 7,801 occurrences:

```
supportStatus     NEW 1870 | NOT_AN_INCIDENT 27
statusCode        404 1256 | 401 505 | 400 83 | 500 16 | 503 10 | others 27
category          DATABASE_RECORD_NOT_FOUND 1217 | AUTH_TOKEN_MISSING 307
                  AUTH_UNAUTHORIZED 102 | SESSION_EXPIRED 48 | SESSION_REVOKED 41
```

Gap 1 — `SESSION_REVOKED` is not recognised. 41 rows, ~1,510 occurrences,
8 of them first seen after the rule deployed and still `NEW`:

- `services/api/src/modules/error-logs/expected-protocol-outcome.ts:32-38` —
  `SESSION_AUTH_CODES` lists `AUTH_TOKEN_MISSING`, `AUTH_TOKEN_INVALID`,
  `AUTH_REFRESH_TOKEN_INVALID`, `AUTH_UNAUTHORIZED`, `SESSION_EXPIRED`. Not
  `SESSION_REVOKED`.

Gap 2 — `404 TENANT_NOT_FOUND` on `GET /api/public/tenants/resolve`: 39 rows,
124 occurrences, for hosts like `www.dijipeople.com`, `app.dijipeople.com` and
a dozen expired Vercel preview URLs. Asking "is this host a tenant?" and being
told "no" is that endpoint's purpose. It is not caught by the existing
unmatched-route branch because the route *does* exist — it answered.

Gap 3 — no backfill. `NOT_AN_INCIDENT` rows range only from
`2026-08-28T17:59` to `2026-08-30T15:49`; everything older is `NEW`,
including 1,166 `Cannot GET /...` scanner probes that the existing rule already
recognises in principle.

## Root Cause

The rule was written narrowly and deliberately — that narrowness is correct and
the file argues well for it, particularly for keeping `400` out. But it was
wired into one of the two write paths, seeded with an incomplete list of
session-ending codes, and applied only going forward. A classification rule
that is not applied to the existing backlog does not clear a backlog.

## Impact

The monitoring screen is not usable for its purpose. An operator opening it
sees 1,870 items needing triage, of which roughly 1,850 need nothing. Genuine
production defects — the Stripe webhook failures in [[BUG-2462]], the
`500`s, the throttled refreshes in [[BUG-2458]] — are indistinguishable from
scanner traffic without pulling the whole queue and aggregating it by hand,
which is how this triage had to be done.

Not a data-loss or security issue, so MEDIUM; but it is the reason every other
finding here went unnoticed.

## Affected Areas

- `services/api/src/modules/error-logs/expected-protocol-outcome.ts`
- `services/api/src/modules/error-logs/error-logs.controller.ts`
- `services/api/src/modules/error-logs/error-logs.service.ts`
- `https://admin.dijipeople.com/settings/monitoring` and its error-logs queue

## Proposed Resolution

1. Add `SESSION_REVOKED` to `SESSION_AUTH_CODES`.
2. Recognise `404 TENANT_NOT_FOUND` on the public tenant-resolve path, matched
   on the path and not on the code alone — the same code on an authenticated
   route means a tenant that should exist and does not.
3. Provide a one-off backfill that applies the current rule to existing `NEW`
   rows, so the queue starts from a true baseline.

Deliberately **not** in scope, each for a stated reason:

- **`400`, `403`, and invalid-credential `401`s.** The reasoning in the module's
  own header applies: a `400` often means our own frontend asked for something
  impossible, and a spike in refused logins or denied permissions is something
  an operator should see.
- **`unmatchedRoute` on the client-reported path.** Server-side it means a
  scanner reached a path we do not serve. From our own tenant app it means our
  own frontend called a route we do not serve — a broken screen, which belongs
  in the queue. The two share a status code and nothing else.

## Acceptance Criteria

- A `401` with `SESSION_REVOKED` is recorded as `NOT_AN_INCIDENT`.
- A `404 TENANT_NOT_FOUND` from the public resolve endpoint is `NOT_AN_INCIDENT`.
- A `404 TENANT_NOT_FOUND` from any other path is still `NEW`.
- A client-reported `404` is still `NEW`.
- `400`, `403`, `409`, `422`, `429` and `5xx` all still arrive as `NEW`, and a
  test asserts it.
- After backfill, the `NEW` count reflects only rows the current rule considers
  incidents.

## Regression Coverage

Extend `expected-protocol-outcome.spec.ts` with the new accepted codes **and**
with negative cases for `400`/`403`/`500`, so a future widening cannot pass
quietly. Registered as a regression entry once written.

## Dependencies

None. The backfill should run after the code change so it applies the final
rule.

## Related Items

[[BUG-1754]] — the record this extends. [[BUG-2459]] and [[BUG-2458]] — the two
defects generating most of the misfiled volume. [[BUG-2460]] — the other defect
on the client-reporting path. [[BUG-1750]], [[BUG-1420]], [[BUG-1419]] — earlier
monitoring-queue defects.

## Resolution

Three changes in `expected-protocol-outcome.ts` and its callers:

1. `SESSION_REVOKED` added to `SESSION_AUTH_CODES`.
2. `404 TENANT_NOT_FOUND` is routine **only** on the public host-resolution
   path, matched on the path via the new `path` input rather than on the code
   alone. `error-logs.service.ts` now passes `input.path` through.
3. `scripts/backfill-incident-classification.mjs` applies the current rule to
   rows recorded before it existed.

The backfill goes through `PATCH /platform/logs/events/:traceId` rather than
the database: that path already requires `monitoring:manage` and already
records who changed what, and slower-and-audited is the right trade for a bulk
change to production data. It is dry-run by default, only ever moves `NEW` to
`NOT_AN_INCIDENT`, never touches a row an operator has moved on, and writes a
manifest that `--revert` consumes. It imports the classifier rather than
reimplementing it — a backfill that disagreed with the live rule would be worse
than none.

Dry run against production on 2026-08-30: **1,680 rows would leave the queue,
190 would remain.**

The negative assertions carry the widening: a `TENANT_NOT_FOUND` from any other
path, a `500` on the resolution path, and a path that merely starts with it all
stay `NEW`. Mutation-tested — removing either change failed four assertions.

## QA Retest

Pending.

## History

- 2026-08-30 — created from the production monitoring triage at `39d8ddc4`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-371 (see the regression register)

<!-- GRAPH:END -->
