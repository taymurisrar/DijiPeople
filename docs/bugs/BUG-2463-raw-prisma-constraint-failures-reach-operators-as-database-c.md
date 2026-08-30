---
ID: BUG-2463
aliases: [BUG-2463]
Title: Raw Prisma constraint failures reach operators as Database constraint failed
Status: DEFERRED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: 39d8ddc4
AffectedModules: [api:platform-runtime, api:super-admin, api:common]
OwnerAgent: architect
ArchitectDisposition: DEFER
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt:
---

# BUG-2463 — Raw Prisma constraint failures reach operators as Database constraint failed

## Summary

Most of this platform answers a rejected write with a sentence a person can
act on — "Department name or code is already in use for this tenant.",
"This price cannot be deleted because 1 later price version(s) reference it."
A handful of paths do not. They let a raw Prisma constraint violation reach the
error catalog's generic fallback, so the operator, and the monitoring queue,
are told only `"Database constraint failed"` or `"Duplicate record"`. There is
nothing in the row to act on: not which constraint, not which field, not which
record.

## Expected Behavior

Every write path that can fail on a known constraint catches it and states, in
domain language, what conflicted. The generic catalog entries remain as a
last-resort fallback for genuinely unanticipated database errors, not as the
normal answer for a foreseeable conflict.

## Actual Behavior

Four production paths surface the generic message.

## Reproduction

Trigger a unique or foreign-key conflict on any of the affected endpoints —
for example `POST /api/platform-runtime/customer-onboarding` for a customer
whose onboarding record already exists. The response carries
`errorCode: DATABASE_CONSTRAINT_FAILED` and `message: "Database constraint failed"`.

## Evidence

Production queue read 2026-08-30 (API commit `ec1d58d`):

```
[2 occ] 409 DATABASE_CONSTRAINT_FAILED  POST /api/platform-runtime/customer-onboarding
        "Database constraint failed"             2026-08-17 .. 2026-08-26T12:27
[1 occ] 409 DATABASE_CONSTRAINT_FAILED  POST /api/platform-runtime/leads/actions/bulk-delete
        "Database constraint failed"             2026-08-28T10:20
[1 occ] 409 DATABASE_CONSTRAINT_FAILED  POST /api/super-admin/tenants/{id}/access-users/{id}/reset-activation
        "Database constraint failed"             2026-06-14T14:00
[2 occ] 409 DATABASE_DUPLICATE_RECORD   GET  /api/platform-runtime/plans?page=1&pageSize=25&viewKey=all&sort=…
        "Duplicate record"                       2026-08-16T12:42
[5 occ] 500 PRISMA_KNOWN_REQUEST_ERROR  POST /api/auth/refresh
        "Database request failed"                2026-08-10 .. 2026-08-12T23:23
[1 occ] 500 PRISMA_KNOWN_REQUEST_ERROR  POST /api/public/leads
        "Database request failed"                2026-08-10T16:51
```

The generic entries:

- `services/api/src/common/errors/error-catalog.ts:385-391` —
  `DATABASE_DUPLICATE_RECORD` → `'Duplicate record'`.
- `services/api/src/common/errors/error-catalog.ts:392-398` —
  `DATABASE_CONSTRAINT_FAILED` → `'Database constraint failed'`.
- `services/api/src/common/errors/error-catalog.ts:417` —
  `PRISMA_KNOWN_REQUEST_ERROR` → `'Database request failed'`.

**Measured, not assumed:** the `GET /api/platform-runtime/plans` case — a read
returning `409 Duplicate record`, which should not be possible — was re-run
against production during this triage and now returns `200`. It is fixed;
it is listed here only as evidence of the shape. The `customer-onboarding` case
is the one that recurred most recently, on 2026-08-26.

## Root Cause

Each of these paths performs a write that can violate a constraint and does not
wrap it. The exception filter then maps the Prisma error code to a catalog entry
whose message is, correctly, a generic fallback — the fallback is doing its job;
the calling code should not be reaching it.

## Impact

Contained but real, and it lands squarely on the surface this triage is about.
An operator opening the monitoring queue sees an incident that cannot be acted
on: `"Database constraint failed"` on `customer-onboarding` says a customer
could not be onboarded and gives no way to find out why. It is also the shape
that makes an incident get skipped rather than investigated.

Low volume — 12 occurrences across six months — hence LOW severity. Filed
because the queue's usefulness depends on rows being actionable.

## Affected Areas

- `POST /api/platform-runtime/customer-onboarding`
- `POST /api/platform-runtime/leads/actions/bulk-delete`
- `POST /api/super-admin/tenants/{id}/access-users/{id}/reset-activation`
- `POST /api/auth/refresh` and `POST /api/public/leads` (`P2xxx` → 500)
- `services/api/src/common/errors/error-catalog.ts` (fallback definitions)

## Proposed Resolution

Per path, catch the anticipated constraint and throw an `AppError` with a
domain message, following the pattern the rest of the codebase already uses —
`"Department name or code is already in use for this tenant."` is the model.
Do not change the catalog entries themselves: they are the correct last resort.

For the two `PRISMA_KNOWN_REQUEST_ERROR` 500s, first establish which Prisma code
was raised; a `P2002` on `auth/refresh` would mean something quite different
from a `P2025`, and both are stale enough that they may already be resolved.
Confirm before changing anything there.

No ExecPlan needed for the message work.

## Acceptance Criteria

- Each listed endpoint returns a domain-specific message for its foreseeable
  constraint conflicts.
- The generic catalog entries still exist and still handle unanticipated errors.
- No new error codes are invented outside the catalog.
- Tests cover the conflict path for each endpoint changed.

## Regression Coverage

Per-endpoint specs asserting the domain message on a constraint conflict.
Registered as a regression entry once written.

## Dependencies

None.

## Related Items

[[BUG-2465]] — the classification work that surfaced these rows. [[BUG-2462]] —
another incident class recorded without enough context to act on.

## Resolution

**Deferred, deliberately.**

Twelve occurrences across six months, and the one case re-tested during triage
(`GET /api/platform-runtime/plans` returning `409 Duplicate record`) already
returns `200` in production.

The reason for deferring is not the low volume — it is that fixing it well
needs evidence this triage does not have. Writing a domain message means
naming *which* constraint was violated, and the recorded incidents do not say:
a `P2002` on `auth/refresh` would mean something entirely different from a
`P2025`. Guessing would produce a confidently wrong message, which is worse for
an operator than an honestly generic one.

The right sequence is: let the [[BUG-2462]]-style `details` capture reach these
paths too, wait for one recurrence carrying the Prisma code, then write the
message that matches it.

## QA Retest

Pending.

## History

- 2026-08-30 — created from the production monitoring triage at `39d8ddc4`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[super-admin]]

<!-- GRAPH:END -->
